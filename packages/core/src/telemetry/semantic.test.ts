/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { toSemanticMessage } from './semantic.js';
import type { Content } from '@google/genai';

describe('toSemanticMessage', () => {
  it('should correctly handle text parts', () => {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
    ];
    expect(toSemanticMessage(contents)).toEqual([
      {
        role: 'user',
        parts: [
          {
            type: 'text',
            content: 'Hello',
          },
        ],
      },
    ]);
  });

  it('should correctly handle function/tool parts', () => {
    const contents: Content[] = [
      {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'test-function',
              args: {
                arg1: 'test-value',
              },
              id: '12345',
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'test-function',
              response: {
                result: 'success',
              },
              id: '12345',
            },
          },
        ],
      },
    ];
    expect(toSemanticMessage(contents)).toEqual([
      {
        role: 'model',
        parts: [
          {
            type: 'tool_call',
            name: 'test-function',
            arguments: '{"arg1":"test-value"}',
            id: '12345',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            type: 'tool_call_response',
            response: '{"result":"success"}',
            id: '12345',
          },
        ],
      },
    ]);
  });
});
