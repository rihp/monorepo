import { getDefaultRedirects } from "./default-redirects";
import { PluginWeb3Api } from "./plugin/PluginWeb3Api";
import { WasmWeb3Api } from "./wasm/WasmWeb3Api";

import {
  Api,
  ApiCache,
  Client,
  createQueryDocument,
  parseQuery,
  PluginPackage,
  QueryApiOptions,
  QueryApiResult,
  Uri,
  UriRedirect,
  resolveUri,
  InvokeApiOptions,
  InvokeApiResult,
  Manifest,
  sanitizeUriRedirects,
} from "@web3api/core-js";
import initTracer, { Tracer, Span } from "@web3api/logger";

export interface ClientConfig<TUri = string> {
  redirects: UriRedirect<TUri>[];
}

export class Web3ApiClient implements Client {
  // TODO: the API cache needs to be more like a routing table.
  // It should help us keep track of what URI's map to what APIs,
  // and handle cases where the are multiple jumps. For exmaple, if
  // A => B => C, then the cache should have A => C, and B => C.
  private _apiCache: ApiCache = new Map<string, Api>();
  private _config: ClientConfig<Uri>;

  private _logger: Tracer;
  private _span: Span;

  constructor(config: ClientConfig, private _showLogging: boolean = false) {
    this._config = {
      ...config,
      redirects: sanitizeUriRedirects(config.redirects),
    };

    // Add all default redirects (IPFS, ETH, ENS)
    this._config.redirects.push(...getDefaultRedirects());

    if (this._showLogging) {
      this._logger = initTracer("web3api-client");
      this._span = this._logger.startSpan("Web3ApiClient");

      this._span.log({ event: "created" });
    }
  }

  public redirects(): readonly UriRedirect<Uri>[] {
    return this._config.redirects;
  }

  public async query<
    TData extends Record<string, unknown> = Record<string, unknown>,
    TVariables extends Record<string, unknown> = Record<string, unknown>
  >(
    options: QueryApiOptions<TVariables, string>
  ): Promise<QueryApiResult<TData>> {
    try {
      const { uri, query, variables } = options;

      // Convert the query string into a query document
      const queryDocument =
        typeof query === "string" ? createQueryDocument(query) : query;

      // Parse the query to understand what's being invoked
      const queryInvocations = parseQuery(
        new Uri(uri),
        queryDocument,
        variables
      );

      // Execute all invocations in parallel
      const parallelInvocations: Promise<{
        name: string;
        result: InvokeApiResult<unknown>;
      }>[] = [];

      for (const invocationName of Object.keys(queryInvocations)) {
        parallelInvocations.push(
          this.invoke({
            ...queryInvocations[invocationName],
            uri: queryInvocations[invocationName].uri.uri,
            decode: true,
          }).then((result) => ({
            name: invocationName,
            result,
          }))
        );
      }

      // Await the invocations
      const invocationResults = await Promise.all(parallelInvocations);

      // Aggregate all invocation results
      const data: Record<string, unknown> = {};
      const errors: Error[] = [];

      for (const invocation of invocationResults) {
        data[invocation.name] = invocation.result.data;
        if (invocation.result.error) {
          errors.push(invocation.result.error);
        }
      }

      return {
        data: data as TData,
        errors: errors.length === 0 ? undefined : errors,
      };
    } catch (error) {
      if (error.length) {
        return { errors: error };
      } else {
        return { errors: [error] };
      }
    }
  }

  public async invoke<TData = unknown>(
    options: InvokeApiOptions<string>
  ): Promise<InvokeApiResult<TData>> {
    try {
      const uri = new Uri(options.uri);
      const api = await this.loadWeb3Api(uri);
      return (await api.invoke(
        {
          ...options,
          uri,
        },
        this
      )) as TData;
    } catch (error) {
      return { error: error };
    }
  }

  public async loadWeb3Api(uri: Uri): Promise<Api> {
    let api = this._apiCache.get(uri.uri);

    if (!api) {
      api = await resolveUri(
        uri,
        this,
        (uri: Uri, plugin: PluginPackage) => new PluginWeb3Api(uri, plugin),
        (uri: Uri, manifest: Manifest, apiResolver: Uri) =>
          new WasmWeb3Api(uri, manifest, apiResolver)
      );

      if (!api) {
        throw Error(`Unable to resolve Web3API at uri: ${uri}`);
      }

      this._apiCache.set(uri.uri, api);
    }

    return api;
  }

  public enableLogging(): void {
    this._quiet = false;
  }

  public disableLogging(): void {
    this._quiet = true;
  }
}
