"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Utils = void 0;
const __1 = require("..");
const isomorphic_unfetch_1 = __importDefault(require("isomorphic-unfetch"));
const ytsr_1 = __importDefault(require("ytsr"));
const apple_music_metadata_1 = __importDefault(require("apple-music-metadata"));
const apple_music_metadata_2 = __importDefault(require("apple-music-metadata"));
const youtubei_1 = require("youtubei");
const discord_js_1 = require("discord.js");
let YouTube = new youtubei_1.Client();
const { getData, getPreview, getTracks, getDetails } = require('spotify-url-info')(isomorphic_unfetch_1.default);
class Utils {
    /**
     * Get ID from YouTube link
     * @param {string} url
     * @returns {?string}
     */
    static parseVideo(url) {
        const match = url.match(this.regexList.YouTubeVideoID);
        if (match) {
            return match[1] || match[2]; // Video ID is captured in one of the capturing groups
        } else {
            return null; // If no match is found
        }
    }
    /**
     * Get timecode from YouTube link
     * @param {string} url
     * @returns {?string}
     */
    static parseVideoTimecode(url) {
        const match = url.match(this.regexList.YouTubeVideoTime);
        return match ? match[3] : null;
    }
    /**
     * Get ID from Playlist link
     * @param {string} url
     * @returns {?string}
     */
    static parsePlaylist(url) {
        const match = url.match(this.regexList.YouTubePlaylistID);
        return match ? match[1] : null;
    }
    /**
     * Search for Songs
     * @param {string} Search
     * @param {PlayOptions} [SOptions=DefaultPlayOptions]
     * @param {Queue} Queue
     * @param {number} [Limit=1]
     * @return {Promise<Song[]>}
     */
    static async search(Search, SOptions = __1.DefaultPlayOptions, Queue, Limit = 5) {
        SOptions = Object.assign({}, __1.DefaultPlayOptions, SOptions);
        let Filters;
        try {
            // Default Options - Type: Video
            let FiltersTypes = await ytsr_1.default.getFilters(Search);
            Filters = FiltersTypes.get('Type').get('Video');
            // Custom Options - Upload date: null
            if (SOptions?.uploadDate !== null)
                Filters = Array.from((await ytsr_1.default.getFilters(Filters.url))
                    .get('Upload date'), ([name, value]) => ({ name, url: value.url }))
                    .find(o => o.name.toLowerCase().includes(SOptions?.uploadDate))
                    ?? Filters;
            // Custom Options - Duration: null
            if (SOptions?.duration !== null)
                Filters = Array.from((await ytsr_1.default.getFilters(Filters.url))
                    .get('Duration'), ([name, value]) => ({ name, url: value.url }))
                    .find(o => o.name.toLowerCase().startsWith(SOptions?.duration))
                    ?? Filters;
            // Custom Options - Sort by: relevance
            if (SOptions?.sortBy !== null && SOptions?.sortBy !== 'relevance')
                Filters = Array.from((await ytsr_1.default.getFilters(Filters.url))
                    .get('Sort by'), ([name, value]) => ({ name, url: value.url }))
                    .find(o => o.name.toLowerCase().includes(SOptions?.sortBy))
                    ?? Filters;
            let Result = await (0, ytsr_1.default)(Filters.url, {
                limit: Limit,
            });
            let items = Result.items;
            let songs = items.map(item => {
                if (item?.type?.toLowerCase() !== 'video')
                    return null;
                return new __1.Song({
                    name: item.title,
                    url: item.url,
                    duration: item.duration,
                    author: item.author.name,
                    isLive: item.isLive,
                    thumbnail: item.bestThumbnail.url,
                }, Queue, SOptions.requestedBy);
            }).filter(I => I);
            return songs;
        }
        catch (e) {
            throw __1.DMPErrors.SEARCH_NULL;
        }
    }
    /**
     * Search for Song via link
     * @param {string} Search
     * @param {PlayOptions} SOptions
     * @param {Queue} Queue
     * @return {Promise<Song>}
     */
    static async link(Search, SOptions = __1.DefaultPlayOptions, Queue) {
        let SpotifyLink = this.regexList.Spotify.test(Search);
        let YouTubeLink = this.regexList.YouTubeVideo.test(Search);
        let AppleLink = this.regexList.Apple.test(Search);
        if (AppleLink) {
            try {
                let AppleResult = await (0, apple_music_metadata_1.default)(Search);
                if (AppleResult) {
                    const artist = AppleResult.type === 'playlist' ? AppleResult.creator : AppleResult.artist;
                    let SearchResult = await this.search(`${artist} - ${AppleResult.title}`, SOptions, Queue);
                    return SearchResult[0];
                }
            }
            catch (e) {
                throw __1.DMPErrors.INVALID_APPLE;
            }
        }
        else if (SpotifyLink) {
            try {
                let SpotifyResult = await getPreview(Search);
                let SearchResult = await this.search(`${SpotifyResult.artist} - ${SpotifyResult.title}`, SOptions, Queue);
                return SearchResult[0];
            }
            catch (e) {
                throw __1.DMPErrors.INVALID_SPOTIFY;
            }
        }
        else if (YouTubeLink) {
            let VideoID = this.parseVideo(Search);
            if (!VideoID)
                throw __1.DMPErrors.SEARCH_NULL;
            YouTube = new youtubei_1.Client();
            let VideoResult = await YouTube.getVideo(VideoID);
            if (!VideoResult)
                throw __1.DMPErrors.SEARCH_NULL;
            let VideoTimecode = this.parseVideoTimecode(Search);
            return new __1.Song({
                name: VideoResult.title,
                url: Search,
                duration: this.msToTime((VideoResult.duration ?? 0) * 1000),
                author: VideoResult.channel.name,
                isLive: VideoResult.isLiveContent,
                thumbnail: VideoResult.thumbnails.best,
                seekTime: SOptions.timecode && VideoTimecode ? Number(VideoTimecode) * 1000 : null,
            }, Queue, SOptions.requestedBy);
        }
        else
            return null;
    }
    /**
     * Gets the best result of a Search
     * @param {Song|string} Search
     * @param {PlayOptions} SOptions
     * @param {Queue} Queue
     * @return {Promise<Song>}
     */
    static async best(Search, SOptions = __1.DefaultPlayOptions, Queue) {
        let _Song;
        if (Search instanceof __1.Song)
            return Search;
        _Song = await this.link(Search, SOptions, Queue);
        if (!_Song) {
            const _Song_Array = (await this.search(Search, SOptions, Queue));
            let i = 0;
            _Song = _Song_Array[i];
            while (!_Song && i < _Song_Array.length) { //Makes sure that a valid song is chosen from first 3 results
                i++;
                _Song = _Song_Array[i];
            }
        }
        return _Song; //Possibly undefined still
    }
    /**
     * Search for Playlist
     * @param {string} Search
     * @param {PlaylistOptions} SOptions
     * @param {Queue} Queue
     * @return {Promise<Playlist>}
     */
    static async playlist(Search, SOptions = __1.DefaultPlaylistOptions, Queue) {
        if (Search instanceof __1.Playlist)
            return Search;
        let Limit = SOptions.maxSongs ?? -1;
        let SpotifyPlaylistLink = this.regexList.SpotifyPlaylist.test(Search);
        let YouTubePlaylistLink = this.regexList.YouTubePlaylist.test(Search);
        let ApplePlaylistLink = this.regexList.ApplePlaylist.test(Search);
        if (ApplePlaylistLink) {
            let AppleResultData = await (0, apple_music_metadata_2.default)(Search).catch(() => null);
            if (!AppleResultData)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            if (AppleResultData.type === 'song')
                throw __1.DMPErrors.INVALID_PLAYLIST;
            let AppleResult = {
                name: AppleResultData.type === "playlist" ? AppleResultData.creator.name : AppleResultData.artist.name,
                author: AppleResultData.type === "playlist" ? AppleResultData.creator.name : AppleResultData.artist.name,
                url: Search,
                songs: [],
                type: AppleResultData.type
            };
            AppleResult.songs = (await Promise.all(AppleResultData.tracks.map(async (track, index) => {
                if (Limit !== -1 && index >= Limit)
                    return null;
                const Result = await this.search(`${track.artist} - ${track.title}`, SOptions, Queue).catch(() => null);
                if (Result && Result[0]) {
                    Result[0].data = SOptions.data;
                    return Result[0];
                }
                else
                    return null;
            })))
                .filter((V) => V !== null);
            if (AppleResult.songs.length === 0)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            if (SOptions.shuffle)
                AppleResult.songs = this.shuffle(AppleResult.songs);
            return new __1.Playlist(AppleResult, Queue, SOptions.requestedBy);
        }
        else if (SpotifyPlaylistLink) {
            let SpotifyResultData = await getData(Search).catch(() => null);
            if (!SpotifyResultData || !['playlist', 'album'].includes(SpotifyResultData.type))
                throw __1.DMPErrors.INVALID_PLAYLIST;
            let SpotifyResult = {
                name: SpotifyResultData.name,
                author: SpotifyResultData.subtitle,
                url: Search,
                songs: [],
                type: SpotifyResultData.type
            };
            SpotifyResult.songs = (await Promise.all(SpotifyResultData.trackList.map(async (track, index) => {
                if (Limit !== -1 && index >= Limit)
                    return null;
                const Result = await this.search(`${track.subtitle} - ${track.title}`, SOptions, Queue).catch(() => null);
                if (Result && Result[0]) {
                    Result[0].data = SOptions.data;
                    return Result[0];
                }
                else
                    return null;
            })))
                .filter((V) => V !== null);
            if (SpotifyResult.songs.length === 0)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            if (SOptions.shuffle)
                SpotifyResult.songs = this.shuffle(SpotifyResult.songs);
            return new __1.Playlist(SpotifyResult, Queue, SOptions.requestedBy);
        }
        else if (YouTubePlaylistLink) {
            let PlaylistID = this.parsePlaylist(Search);
            if (!PlaylistID)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            YouTube = new youtubei_1.Client();
            let YouTubeResultData = await YouTube.getPlaylist(PlaylistID);
            if (!YouTubeResultData || Object.keys(YouTubeResultData).length === 0)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            let YouTubeResult = {
                name: YouTubeResultData.title,
                author: YouTubeResultData instanceof youtubei_1.Playlist ? YouTubeResultData.channel?.name ?? 'YouTube Mix' : 'YouTube Mix',
                url: Search,
                songs: [],
                type: 'playlist'
            };
            if (YouTubeResultData instanceof youtubei_1.Playlist && YouTubeResultData.videoCount > 100 && (Limit === -1 || Limit > 100))
                await YouTubeResultData.videos.next(Math.floor((Limit === -1 || Limit > YouTubeResultData.videoCount ? YouTubeResultData.videoCount : Limit - 1) / 100));
            if (YouTubeResultData.videos instanceof youtubei_1.PlaylistVideos) {
                //Needs VideoCompact[] for map to work below
                YouTubeResultData.videos = YouTubeResultData.videos.items;
            }
            YouTubeResult.songs = YouTubeResultData.videos.map((video, index) => {
                if (Limit !== -1 && index >= Limit)
                    return null;
                let song = new __1.Song({
                    name: video.title,
                    url: `https://youtube.com/watch?v=${video.id}`,
                    duration: this.msToTime((video.duration ?? 0) * 1000),
                    author: video.channel.name,
                    isLive: video.isLive,
                    thumbnail: video.thumbnails.best,
                }, Queue, SOptions.requestedBy);
                song.data = SOptions.data;
                return song;
            })
                .filter((V) => V !== null);
            if (YouTubeResult.songs.length === 0)
                throw __1.DMPErrors.INVALID_PLAYLIST;
            if (SOptions.shuffle)
                YouTubeResult.songs = this.shuffle(YouTubeResult.songs);
            return new __1.Playlist(YouTubeResult, Queue, SOptions.requestedBy);
        }
        throw __1.DMPErrors.INVALID_PLAYLIST;
    }
    /**
     * Shuffles an array
     * @param {any[]} array
     * @returns {any[]}
     */
    static shuffle(array) {
        if (!Array.isArray(array))
            return [];
        const clone = [...array];
        const shuffled = [];
        while (clone.length > 0)
            shuffled.push(clone.splice(Math.floor(Math.random() * clone.length), 1)[0]);
        return shuffled;
    }
    /**
     * Converts milliseconds to duration (HH:MM:SS)
     * @returns {string}
     */
    static msToTime(duration) {
        const seconds = Math.floor(duration / 1000 % 60);
        const minutes = Math.floor(duration / 60000 % 60);
        const hours = Math.floor(duration / 3600000);
        const secondsPad = `${seconds}`.padStart(2, '0');
        const minutesPad = `${minutes}`.padStart(2, '0');
        const hoursPad = `${hours}`.padStart(2, '0');
        return `${hours ? `${hoursPad}:` : ''}${minutesPad}:${secondsPad}`;
    }
    /**
     * Converts duration (HH:MM:SS) to milliseconds
     * @returns {number}
     */
    static timeToMs(duration) {
        return duration.split(':')
            .reduceRight((prev, curr, i, arr) => prev + parseInt(curr) * 60 ** (arr.length - 1 - i), 0) * 1000;
    }
    static isVoiceChannel(Channel) {
        let type = Channel.type;
        if (typeof type === 'string')
            return ['GUILD_VOICE', 'GUILD_STAGE_VOICE'].includes(type);
        else
            return [discord_js_1.ChannelType.GuildVoice, discord_js_1.ChannelType.GuildStageVoice].includes(type);
    }
    static isStageVoiceChannel(Channel) {
        let type = Channel.type;
        if (typeof type === 'string')
            return type === 'GUILD_STAGE_VOICE';
        else
            return type === discord_js_1.ChannelType.GuildStageVoice;
    }
}
Utils.regexList = {
    YouTubeVideo: /^((?:https?:)\/\/)?((?:www|m)\.)?((?:youtube\.com|youtu.be))((?!channel)(?!user)\/(?:[\w\-]+\?v=|embed\/|v\/)?)((?!channel)(?!user)[\w\-]+)/,
    YouTubeVideoTime: /(([?]|[&])t=(\d+))/,
    YouTubeVideoID: /(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=))([a-zA-Z0-9_-]{11})(?:\?.*shorts=1)?|youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    YouTubePlaylist: /^((?:https?:)\/\/)?((?:www|m)\.)?((?:youtube\.com)).*(youtu.be\/|list=)([^#&?]*).*/,
    YouTubePlaylistID: /[&?]list=([^&]+)/,
    Spotify: /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:track\/|\?uri=spotify:track:)((\w|-)+)(?:(?=\?)(?:[?&]foo=(\d*)(?=[&#]|$)|(?![?&]foo=)[^#])+)?(?=#|$)/,
    SpotifyPlaylist: /https?:\/\/(?:embed\.|open\.)(?:spotify\.com\/)(?:(album|playlist)\/|\?uri=spotify:playlist:)((\w|-)+)(?:(?=\?)(?:[?&]foo=(\d*)(?=[&#]|$)|(?![?&]foo=)[^#])+)?(?=#|$)/,
    Apple: /https?:\/\/music\.apple\.com\/.+?\/.+?\/(.+?)\//,
    ApplePlaylist: /https?:\/\/music\.apple\.com\/.+?\/.+?\/(.+?)\//,
};
exports.Utils = Utils;
