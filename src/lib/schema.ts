import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "@schema/test-case.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateFn = ajv.compile(schema);

export interface SchemaError {
  path: string;
  message: string;
}

export function validateCase(
  json: unknown,
): { ok: true } | { ok: false; errors: SchemaError[] } {
  if (validateFn(json)) return { ok: true };
  const errors: SchemaError[] = (validateFn.errors ?? []).map((e) => ({
    path: e.instancePath || "(root)",
    message: e.message ?? "validation error",
  }));
  return { ok: false, errors };
}
