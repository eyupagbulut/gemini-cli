/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  GenerateContentConfig,
  GenerateContentParameters,
  GenerateContentResponseUsageMetadata,
  GenerateContentResponse,
} from '@google/genai';
import {
  ApiRequestEvent,
  ApiResponseEvent,
  ApiErrorEvent,
} from '../telemetry/types.js';
import type { Config } from '../config/config.js';
import {
  logApiError,
  logApiRequest,
  logApiResponse,
} from '../telemetry/loggers.js';
import type { ContentGenerator } from './contentGenerator.js';
import { toContents } from '../code_assist/converter.js';
import { isStructuredError } from '../utils/quotaErrorDetection.js';

interface StructuredError {
  status: number;
}

/**
 * A decorator that wraps a ContentGenerator to add logging to API calls.
 */
export class LoggingContentGenerator implements ContentGenerator {
  constructor(
    private readonly wrapped: ContentGenerator,
    private readonly config: Config,
  ) {}

  getWrapped(): ContentGenerator {
    return this.wrapped;
  }

  private logApiRequest(
    contents: Content[],
    model: string,
    promptId: string,
  ): void {
    const requestText = JSON.stringify(contents);
    logApiRequest(
      this.config,
      new ApiRequestEvent(model, promptId, requestText),
    );
  }

  private _logApiResponse(
    contents: Content[],
    durationMs: number,
    model: string,
    prompt_id: string,
    responseId: string | undefined,
    usageMetadata?: GenerateContentResponseUsageMetadata,
    responseText?: string,
    finish_reason?: string,
    generationConfig?: GenerateContentConfig,
  ): void {
    const content_str: string = JSON.stringify(contents);
    logApiResponse(
      this.config,
      new ApiResponseEvent(
        model,
        durationMs,
        prompt_id,
        {
          model,
          temperature: generationConfig?.temperature,
          top_p: generationConfig?.topP,
          top_k: generationConfig?.topK,
        },
        {
          // TODO: make this content match expected format; maybe pass in raw?
          // TODO: maybe don't pass in length cuz can infer
          prompt: content_str,
          prompt_length: content_str.length,
        },
        {
          finish_reason,
          response_id: responseId,
          input_token_count: usageMetadata?.promptTokenCount,
          output_token_count: usageMetadata?.candidatesTokenCount,
          cached_content_token_count: usageMetadata?.cachedContentTokenCount,
          thoughts_token_count: usageMetadata?.thoughtsTokenCount,
          tool_token_count: usageMetadata?.toolUsePromptTokenCount,
          total_token_count: usageMetadata?.totalTokenCount,
        },
        this.config.getContentGeneratorConfig()?.authType,
        usageMetadata,
        responseText,
      ),
    );
  }

  private _logApiError(
    durationMs: number,
    error: unknown,
    model: string,
    prompt_id: string,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = error instanceof Error ? error.name : 'unknown';

    logApiError(
      this.config,
      new ApiErrorEvent(
        model,
        errorMessage,
        durationMs,
        prompt_id,
        this.config.getContentGeneratorConfig()?.authType,
        errorType,
        isStructuredError(error)
          ? (error as StructuredError).status
          : undefined,
      ),
    );
  }

  async generateContent(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const startTime = Date.now();
    const contents: Content[] = toContents(req.contents);
    this.logApiRequest(toContents(req.contents), req.model, userPromptId);
    try {
      const response = await this.wrapped.generateContent(req, userPromptId);
      const durationMs = Date.now() - startTime;
      this._logApiResponse(
        contents,
        durationMs,
        response.modelVersion || req.model,
        userPromptId,
        response.responseId,
        response.usageMetadata,
        JSON.stringify(response),
        response.candidates?.[0]?.finishReason,
        req.config,
      );
      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, req.model, userPromptId);
      throw error;
    }
  }

  async generateContentStream(
    req: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const startTime = Date.now();
    this.logApiRequest(toContents(req.contents), req.model, userPromptId);

    let stream: AsyncGenerator<GenerateContentResponse>;
    try {
      stream = await this.wrapped.generateContentStream(req, userPromptId);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(durationMs, error, req.model, userPromptId);
      throw error;
    }

    return this.loggingStreamWrapper(
      stream,
      startTime,
      userPromptId,
      req.model,
    );
  }

  private async *loggingStreamWrapper(
    stream: AsyncGenerator<GenerateContentResponse>,
    startTime: number,
    userPromptId: string,
    model: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const responses: GenerateContentResponse[] = [];

    let lastUsageMetadata: GenerateContentResponseUsageMetadata | undefined;
    let finishReason: string | undefined;
    try {
      for await (const response of stream) {
        responses.push(response);
        if (response.usageMetadata) {
          lastUsageMetadata = response.usageMetadata;
        }
        if (response.candidates?.[0]?.finishReason) {
          finishReason = response.candidates[0].finishReason;
        }
        yield response;
      }
      // Only log successful API response if no error occurred
      const durationMs = Date.now() - startTime;
      this._logApiResponse(
        durationMs,
        responses[0]?.modelVersion || model,
        userPromptId,
        responses[0]?.responseId,
        lastUsageMetadata,
        JSON.stringify(responses),
        finishReason,
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this._logApiError(
        durationMs,
        error,
        responses[0]?.modelVersion || model,
        userPromptId,
      );
      throw error;
    }
  }

  async countTokens(req: CountTokensParameters): Promise<CountTokensResponse> {
    return this.wrapped.countTokens(req);
  }

  async embedContent(
    req: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return this.wrapped.embedContent(req);
  }
}
