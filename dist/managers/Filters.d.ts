/// <reference types="node" />
/**
 * From Discord-Player, changed for DMP usage
 */
import { FFmpeg } from "prism-media";
import type { Readable } from "stream";
import { Filter, StreamFiltersName } from "../types/types";
export interface FFmpegStreamOptions {
    encoderArgs?: [Filter];
    seek?: number;
}
export declare function FFMPEG_ARGS_STRING(): string[];
/**
 * Creates FFmpeg stream
 * @param stream The source stream
 * @param options FFmpeg stream options
 * @returns stream
 */
export declare function createFFmpegStream(stream: Readable, options?: FFmpegStreamOptions): FFmpeg;
export declare const StreamFilters: Record<StreamFiltersName, Filter>;
