import { PluginManifest } from "@web3api/core-js";

export const manifest: PluginManifest = {
  // TODO: use the schema.graphql
  // https://github.com/Web3-API/prototype/issues/101
  schema: `type Header {
    key: String!
    value: String!
  }
  
  type UrlParam {
    key: String!
    value: String!
  }
  
  type Response {
    status: UInt64!
    statusText: String!
    headers: [Header!]
    body: String!
  }
  
  type Request {
    headers: [Header!]
    urlParams: [UrlParam!]
    responseType: String! # "TEXT" || "BINARY"
    body: String
  }
  
  type Query {
    get(url: String!, request: Request!): Response
  }
  
  type Mutation {
    post(url: String!, request: Request!): Response
  }
  `,
  implemented: [],
  imported: [],
};
