/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

/**
 * Converts an array of Content objects to follow the OpenTelemetry semantic conventions
 * for generative AI input messages.
 *
 * @see https://github.com/open-telemetry/semantic-conventions/blob/6f59b508cfa6c2d50bb1a0eebf1152dae9e48164/docs/gen-ai/gen-ai-input-messages.json
 * @param contents The array of Content objects to convert.
 * @returns An array of correspnoding ChatMessage objects
 */
export function toSemanticMessage(contents: Content[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const content of contents) {
    const message: ChatMessage = { role: content.role, parts: [] };
    if (content.parts) {
      for (const part of content.parts) {
        if (part.text) {
          message.parts.push(new TextPart(part.text));
        } else if (part.functionCall) {
          message.parts.push(
            new ToolCallRequestPart(
              part.functionCall.name,
              part.functionCall.id,
              JSON.stringify(part.functionCall.args),
            ),
          );
        } else if (part.functionResponse) {
          message.parts.push(
            new ToolCallResponsePart(
              JSON.stringify(part.functionResponse.response),
              part.functionResponse.id,
            ),
          );
        }
      }
      messages.push(message);
    }
  }
  return messages;
}

/**
 * Based on OpenTelemetry semantic conventions for GenAI input messages.
 * @see https://github.com/open-telemetry/semantic-conventions/blob/6f59b508cfa6c2d50bb1a0eebf1152dae9e48164/docs/gen-ai/gen-ai-input-messages.json
 */

export type InputMessages = ChatMessage[];

export interface ChatMessage {
  role: string | undefined;
  parts: Array<| TextPart
    | ToolCallRequestPart
    | ToolCallResponsePart
    | ReasoningPart
    | GenericPart>;
}

export class TextPart {
  readonly type = 'text';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class ToolCallRequestPart {
  readonly type = 'tool_call';
  name?: string;
  id?: string;
  arguments?: string;

  constructor(name?: string, id?: string, args?: string) {
    this.name = name;
    this.id = id;
    this.arguments = args;
  }
}

export class ToolCallResponsePart {
  readonly type = 'tool_call_response';
  response?: string;
  id?: string;

  constructor(response?: string, id?: string) {
    this.response = response;
    this.id = id;
  }
}

export class ReasoningPart {
  readonly type = 'reasoning';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class GenericPart {
  type: string;
  [key: string]: unknown;

  constructor(type: string, data: { [key: string]: unknown }) {
    this.type = type;
    Object.assign(this, data);
  }
}
