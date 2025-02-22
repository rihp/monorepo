import { Project as TsProject } from "ts-morph";
import fs from "fs";
import path from "path";

interface PluginConfigSource {
  name: string;
  module: string;
  file: string;
  uri: string;
  config: string;
  interfaces?: string[];
  types?: string[];
  externals?: {
    type: string;
    module: string;
  }[];
}

const plugins: PluginConfigSource[] = [
  {
    name: "Ipfs",
    module: "@web3api/ipfs-plugin-js",
    file: "build/index.d.ts",
    uri: "w3://ens/ipfs.web3api.eth",
    config: "IpfsConfig",
    interfaces: ["IpfsConfig"]
  },
  {
    name: "Ethereum",
    module: "@web3api/ethereum-plugin-js",
    file: "build/index.d.ts",
    uri: "w3://ens/ethereum.web3api.eth",
    config: "EthereumConfig",
    interfaces: ["EthereumConfig"],
    types: ["EthereumProvider", "EthereumSigner", "AccountIndex", "Address"],
    externals: [
      {
        type: "Signer",
        module: "ethers"
      },
      {
        type: "ExternalProvider",
        module: "@ethersproject/providers"
      }
    ]
  },
  {
    name: "Ens",
    module: "@web3api/ens-plugin-js",
    file: "build/index.d.ts",
    uri: "w3://ens/ens.web3api.eth",
    config: "EnsConfig",
    interfaces: ["EnsConfig"],
    types: ["Address"]
  }
];

function main(): void {

  const header = "/// NOTE: This is an auto-generated file. See scripts/extractPluginConfigs.ts\n" +
    "/* eslint-disable @typescript-eslint/no-explicit-any */";
  const outputFiles: {
    fileName: string,
    content: string
  }[] = [];

  for (const plugin of plugins) {
    let output = header;

    output += `\n\n/// Types generated from ${plugin.file}`

    const project = new TsProject();
    const filePath = require.resolve(path.join(plugin.module, plugin.file));
    const sourceFile = project.addSourceFileAtPath(filePath);

    for (const pluginInterface of plugin.interfaces || []) {
      const int = sourceFile.getInterfaceOrThrow(pluginInterface);
      output += `\n\n${int.print().replace(/    /g, "  ")}`;
    }

    for (const pluginType of plugin.types || []) {
      const typ = sourceFile.getTypeAliasOrThrow(pluginType);
      output += `\n\n${typ.print().replace("declare ", "")}`;
    }

    for (const pluginExternal of plugin.externals || []) {
      output += `\n\n// import { ${pluginExternal.type} } from "${pluginExternal.module}"`;
      output += `\nexport type ${pluginExternal.type} = any;`;
    }

    outputFiles.push({
      fileName: `${plugin.name}.ts`,
      content: output + "\n"
    });
  }

  let indexContent = header + "\n";

  let pluginConfigs = "\n\ninterface PluginConfigs {";
  let pluginModules = "\n\nconst modules: Record<string, string> = {";
  let pluginUris = "\n\nconst uris: Record<string, string> = {";

  for (const plugin of plugins) {
    const pluginKey = plugin.name.toLowerCase();
    indexContent += `\nimport { ${plugin.config} } from "./${plugin.name}";`;
    pluginConfigs += `\n  ${pluginKey}?: ${plugin.config};`;
    pluginModules += `\n  ${pluginKey}: "${plugin.module}",`;
    pluginUris += `\n  ${pluginKey}: "${plugin.uri}",`;
  }

  pluginConfigs += `\n}`;
  pluginModules += `\n};`;
  pluginUris += `\n};`;

  indexContent += pluginConfigs + pluginModules + pluginUris + `\n\nexport { PluginConfigs, modules, uris };\n`;

  outputFiles.push({
    fileName: "index.ts",
    content: indexContent
  });

  for (const outputFile of outputFiles) {
    fs.writeFileSync(
      __dirname + "/../src/pluginConfigs/" + outputFile.fileName,
      outputFile.content
    );
  }
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
