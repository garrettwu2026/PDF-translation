export type StructuredOutputSchema = {
  name: string;
  schema: Record<string, unknown>;
};

export const getGoogleStructuredOutputConfig = (
  jsonMode: boolean | undefined,
  jsonSchema: StructuredOutputSchema | undefined,
) => ({
  responseMimeType: jsonMode || jsonSchema ? 'application/json' : undefined,
  responseJsonSchema: jsonSchema?.schema,
});

export const getOpenAIResponseFormat = (
  jsonMode: boolean | undefined,
  jsonSchema: StructuredOutputSchema | undefined,
) => jsonSchema
  ? {
      type: 'json_schema' as const,
      json_schema: {
        name: jsonSchema.name,
        strict: true,
        schema: jsonSchema.schema,
      },
    }
  : jsonMode ? { type: 'json_object' as const } : undefined;

