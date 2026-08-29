/** The shape of one entry in the generated conformance plan. */
export type XrpcExampleRole = "chained" | "destructive" | "primary" | "undo";

export type XrpcExampleMethod = {
  auth: "none" | "optional-did" | "required";
  body?: Record<string, unknown>;
  description: string;
  kind: "procedure" | "query";
  nsid: string;
  params?: Record<string, string>;
  role: XrpcExampleRole;
  section: string;
  undo?: string;
};
