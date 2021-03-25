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
import { Tracer } from "@web3api/tracing";

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

  constructor(config?: ClientConfig, private _traceEnabled: boolean = false) {
    if (this._traceEnabled) {
      this.enableTracing();
    }

    Tracer.startSpan("constructor");

    if (config) {
      this._config = {
        ...config,
        redirects: sanitizeUriRedirects(config.redirects),
      };
    } else {
      this._config = {
        redirects: [],
      };
    }

    // Add all default redirects (IPFS, ETH, ENS)
    this._config.redirects.push(...getDefaultRedirects());

    Tracer.setAttribute("config", this._config);
    Tracer.addEvent("Created");

    Tracer.endSpan();
  }

  public enableTracing(): void {
    Tracer.enableTracing("web3api-client");
  }

  public disableTracing(): void {
    Tracer.disableTracing();
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

      Tracer.startSpan("query");

      Tracer.setAttribute("options", options);

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

      Tracer.addEvent("Invocations finished", invocationResults);

      // Aggregate all invocation results
      const data: Record<string, unknown> = {};
      const errors: Error[] = [];

      for (const invocation of invocationResults) {
        data[invocation.name] = invocation.result.data;
        if (invocation.result.error) {
          errors.push(invocation.result.error);
        }
      }

      Tracer.setAttribute("data", data);
      Tracer.setAttribute("errors", errors);

      Tracer.endSpan();

      return {
        data: data as TData,
        errors: errors.length === 0 ? undefined : errors,
      };
    } catch (error) {
      Tracer.recordException(error);

      if (error.length) {
        return { errors: error };
      } else {
        return { errors: [error] };
      }
    } finally {
      Tracer.endSpan();
    }
  }

  public async invoke<TData = unknown>(
    options: InvokeApiOptions<string>
  ): Promise<InvokeApiResult<TData>> {
    try {
      const uri = new Uri(options.uri);

      Tracer.startSpan("invoke");

      Tracer.setAttribute("options", options);

      const api = await this.loadWeb3Api(uri);

      Tracer.addEvent("Load web3api", api);
      Tracer.endSpan();

      return (await api.invoke(
        {
          ...options,
          uri,
        },
        this
      )) as TData;
    } catch (error) {
      Tracer.recordException(error);

      return { error: error };
    } finally {
      Tracer.endSpan();
    }
  }

  public async loadWeb3Api(uri: Uri): Promise<Api> {
    let api = this._apiCache.get(uri.uri);

    Tracer.startSpan("loadWeb3Api");

    Tracer.setAttribute("uri", uri);

    if (!api) {
      api = await resolveUri(
        uri,
        this,
        (uri: Uri, plugin: PluginPackage) => new PluginWeb3Api(uri, plugin),
        (uri: Uri, manifest: Manifest, apiResolver: Uri) =>
          new WasmWeb3Api(uri, manifest, apiResolver)
      );

      Tracer.addEvent("Resolve uri", api);

      if (!api) {
        throw Error(`Unable to resolve Web3API at uri: ${uri}`);
      }

      this._apiCache.set(uri.uri, api);
    }

    Tracer.endSpan();

    return api;
  }
}
