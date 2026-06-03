export function readStringProperty(input: unknown, property: string): string {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "string") {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

export function readOptionalStringProperty(
  input: unknown,
  property: string
): string | undefined {
  const value = readUnknownProperty(input, property);

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid IPC payload: ${property} must be a string`);
  }

  return value;
}

export function readOptionalStringArrayProperty(
  input: unknown,
  property: string
): readonly string[] | undefined {
  const value = readUnknownProperty(input, property);

  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isStringArray(value)) {
    throw new Error(`Invalid IPC payload: ${property} must be a string array`);
  }

  return value;
}

export function readBooleanProperty(input: unknown, property: string): boolean {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "boolean") {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

export function readOptionalBooleanProperty(
  input: unknown,
  property: string
): boolean | undefined {
  const value = readUnknownProperty(input, property);

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error(`Invalid IPC payload: ${property} must be a boolean`);
  }

  return value;
}

export function readNumberProperty(input: unknown, property: string): number {
  const value = readUnknownProperty(input, property);

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid IPC payload: missing ${property}`);
  }

  return value;
}

export function readEnumProperty<const T extends string>(
  input: unknown,
  property: string,
  values: readonly T[]
): T {
  const value = readStringProperty(input, property);

  if (!values.includes(value as T)) {
    throw new Error(`Invalid IPC payload: unsupported ${property}`);
  }

  return value as T;
}

export function readUnknownProperty(input: unknown, property: string): unknown {
  if (
    typeof input !== "object" ||
    input === null ||
    !Object.prototype.hasOwnProperty.call(input, property)
  ) {
    return undefined;
  }

  return (input as Record<string, unknown>)[property];
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
