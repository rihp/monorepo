import { AnyManifest, ManifestFormats } from "./";

// TODO: Uncomment when a new version exists
// import schema_0_0_1_alpha_2 from "@web3api/manifest-schema/formats/0.0.1-prealpha.2.json";
import schema_0_0_1_prealpha_1 from "@web3api/manifest-schema/formats/0.0.1-prealpha.1.json";
import { Validator, Schema } from "jsonschema";
import { Tracer } from "@web3api/tracing";

enum ValidationError {
  ADDITIONAL_PROPERTY = "additionalProperties",
  TYPE = "type",
  REQUIRED = "required",
  INPUT = "format",
}

const manifestSchemas: { [key in ManifestFormats]: Schema | undefined } = {
  "0.0.1-prealpha.1": schema_0_0_1_prealpha_1,
  // TODO: Uncomment when a new version exists
  // "0.0.1-prealpha.2": schema_0_0_1_prealpha_2
};

const validator = new Validator();

Validator.prototype.customFormats.file = (file: unknown) => {
  return validateFile(file);
};

function validateFile(path: unknown): boolean {
  Tracer.startSpan("core: validateFile");
  Tracer.setAttribute("path", path);

  if (typeof path !== "string") {
    return false;
  }

  // eslint-disable-next-line no-useless-escape
  const validPathMatch = path.match(/^((\.\/|..\/)[^\/ ]*)+\/?$/gm);

  let result = false;
  if (validPathMatch && validPathMatch[0]) {
    result = validPathMatch[0].length === path.length;
  }

  Tracer.addEvent("validate file finished", result);
  Tracer.endSpan();

  return result;
}

Validator.prototype.customFormats.manifestFormat = (format: unknown) => {
  return validateFormat(format);
};

function validateFormat(format: unknown): boolean {
  Tracer.startSpan("core: validateFormat");
  Tracer.setAttribute("format", format);

  if (typeof format !== "string") {
    return false;
  }

  const result = manifestSchemas[format as ManifestFormats] !== undefined;

  Tracer.addEvent("validate format finished", result);
  Tracer.endSpan();

  return result;
}

export function validateManifest(manifest: AnyManifest): void {
  Tracer.startSpan("core: validateManifest");
  Tracer.setAttribute("manifest", manifest);

  try {
    const schema = manifestSchemas[manifest.format as ManifestFormats];

    if (!schema) {
      throw Error(`Unrecognized manifest schema format "${manifest.format}"`);
    }

    const { errors } = validator.validate(manifest, schema);

    /*
   We should handle five cases or errors:
   1- When a non-accepted field is added to the manifest
   2- When the type of the field is unknown
   3- When a required field is not sent
   4- When version string is not correct
   5- When file string is not an existing file
  */
    if (errors.length > 0) {
      const { path, message, name, argument, instance } = errors[0];
      const pathMapping = path.join(" -> ");

      Tracer.addEvent("manifest is invalid", { errors });
      Tracer.endSpan();

      switch (name) {
        case ValidationError.REQUIRED: {
          const propertyRequired =
            path.length === 0
              ? `${argument}.`
              : `${argument} in ${pathMapping}.`;
          throw Error(
            `Missing field: ${propertyRequired} Please add it to the manifest`
          );
        }
        case ValidationError.ADDITIONAL_PROPERTY:
          throw Error(
            `Field ${argument} is not accepted in the schema. Please check the accepted fields here: TODO - LINK_TO_SCHEMA`
          );
        case ValidationError.TYPE: {
          const property =
            path.length === 1
              ? `Property ${path[0]}`
              : `Property ${pathMapping}`;
          throw Error(`${property} has a type error: ${message}`);
        }
        case ValidationError.INPUT: {
          const isFormatVersionError = argument === "manifestFormat";
          const isFileError = argument === "file";

          if (isFormatVersionError) {
            throw Error(
              `The manifest's format is not correct. Given: ${
                manifest.format
              }\nAccepted formats: ${Object.keys(manifestSchemas)}`
            );
          } else if (isFileError) {
            throw Error(
              `Property ${pathMapping} has the value "${instance}", which is not a valid file path.` +
                ` Please use unix style relative paths.`
            );
          } else {
            throw Error(
              `Unknown INPUT error found:` +
                `\nName: ${name}\nPath: ${pathMapping}\nMessage: ${message}\nArgument: ${argument}\nValue: ${instance}`
            );
          }
        }
        default:
          throw Error(
            `Unknown manifest sanitization error:` +
              `\nName: ${name}\nPath: ${pathMapping}\nMessage: ${message}\nArgument: ${argument}\nValue: ${instance}`
          );
      }
    }

    Tracer.addEvent("manifest is valid");
    Tracer.endSpan();
  } catch (error) {
    Tracer.recordException(error);
    Tracer.endSpan();

    throw error;
  }
}
