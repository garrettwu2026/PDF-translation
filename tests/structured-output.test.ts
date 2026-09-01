import assert from 'node:assert/strict';
import test from 'node:test';
import { getGoogleStructuredOutputConfig, getOpenAIResponseFormat } from '../src/lib/structured-output.ts';

const fixture = {
  name: 'fixture',
  schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] },
};

test('provider structured-output adapters use the same JSON schema', () => {
  assert.deepEqual(getGoogleStructuredOutputConfig(false, fixture), {
    responseMimeType: 'application/json',
    responseJsonSchema: fixture.schema,
  });
  assert.deepEqual(getOpenAIResponseFormat(false, fixture), {
    type: 'json_schema',
    json_schema: { name: 'fixture', strict: true, schema: fixture.schema },
  });
});

test('legacy JSON mode remains available without a schema', () => {
  assert.deepEqual(getOpenAIResponseFormat(true, undefined), { type: 'json_object' });
  assert.deepEqual(getGoogleStructuredOutputConfig(false, undefined), {
    responseMimeType: undefined,
    responseJsonSchema: undefined,
  });
});

