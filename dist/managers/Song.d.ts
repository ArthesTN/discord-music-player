import { User } from 'discord.js';
import { Filter, Player, Queue, RawSong } from '..';
export declare class Song {
    player: Player;
    queue: Queue;
    name: string;
    author: string;
    url: string;
    thumbnail: string;
    requestedBy?: User;
    duration: string;
    isLive: boolean;
    isFirst: boolean;
    seekTime: number;
    data?: any;
    firstTimeInQueue: boolean;
    filters: [Filter] | undefined;
    /**
     * Song constructor
     * @param {RawSong} raw
     * @param {Queue} queue
     * @param {User} [requestedBy]
     */
    constructor(raw: RawSong, queue: Queue, requestedBy?: User);
    /**
     * Converts duration (HH:MM:SS) to milliseconds
     * @type {number}
     */
    get milliseconds(): number;
    /**
     * @param {?boolean} first
     * @private
     */
    _setFirst(first?: boolean): void;
    /**
     * Set's custom song data
     * @param {any} data
     * @returns {void}
     */
    setData(data: any): void;
    /**
     * Song name and author in string representation
     * @returns {string}
     */
    toString(): string;
    /**
     * Toggles firstTimeInQueue
     * @returns {void}
     */
    flipFirstTimeInQueue(): void;
}
