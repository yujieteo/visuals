// Types of the shared kit (scripts/kit/kit.js) that a generated visual's own JavaScript names, for type checking
// only. Types alone, no globals: a generated visual declares the kit's global in its types/globals.d.ts.

/** One field of a visual's semantic state; scripts/kit/kit.js says what each part means. */
interface KitField {
  type: "enum" | "number" | "integer" | "boolean" | "string";
  default: string | number | boolean;
  label: string;
  values?: string[];
  min?: number;
  max?: number;
  step?: number;
}

/** A named state with a stable id. */
interface KitExample {
  id: string;
  label: string;
  state: Record<string, string | number | boolean>;
}

/** A read-only WebMCP tool, as a visual passes it to the kit. */
interface KitTool {
  name: string;
  description: string;
  inputSchema: object;
  annotations?: object;
  execute(input?: any): Promise<object>;
}
