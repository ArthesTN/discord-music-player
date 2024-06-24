"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const StreamConnection_1 = require("../voice/StreamConnection");
const voice_1 = require("@discordjs/voice");
const __1 = require("..");
const play_dl_1 = require("yt-stream");
const Filters_1 = require("./Filters");
class Queue {
    /**
     * Queue constructor
     * @param {Player} player
     * @param {Guild} guild
     * @param {PlayerOptions} options
     */
    constructor(player, guild, options) {
        /**
         * Player instance
         * @name Queue#player
         * @type {Player}
         * @readonly
         */
        this.songs = [];
        this.isPlaying = false;
        this.options = __1.DefaultPlayerOptions;
        this.repeatMode = __1.RepeatMode.DISABLED;
        this.destroyed = false;
        /**
         * Guild instance
         * @name Queue#guild
         * @type {Guild}
         * @readonly
         */
        /**
         * Queue connection
         * @name Queue#connection
         * @type {?StreamConnection}
         * @readonly
         */
        /**
         * Queue songs
         * @name Queue#songs
         * @type {Song[]}
         */
        /**
         * If Song is playing on the Queue
         * @name Queue#isPlaying
         * @type {boolean}
         * @readonly
         */
        /**
         * Queue custom data
         * @name Queue#data
         * @type {any}
         */
        /**
         * Queue options
         * @name Queue#options
         * @type {PlayerOptions}
         */
        /**
         * Queue repeat mode
         * @name Queue#repeatMode
         * @type {RepeatMode}
         */
        /**
         * If the queue is destroyed
         * @name Queue#destroyed
         * @type {boolean}
         * @readonly
         */
        this.player = player;
        this.guild = guild;
        this.options = { ...__1.DefaultPlayerOptions, ...options };
    }
    /**
     * Joins a voice channel
     * @param {GuildChannelResolvable} channelId
     * @returns {Promise<Queue>}
     */
    async join(channelId) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (this.connection)
            return this;
        const channel = this.guild.channels.resolve(channelId);
        if (!channel) {
            this.player.emit('error', __1.DMPErrorMessages.UnknownVoice, this);
            throw new __1.DMPError(__1.DMPErrors.UNKNOWN_VOICE);
        }
        if (!__1.Utils.isVoiceChannel(channel)) {
            this.player.emit('error', __1.DMPErrorMessages.ChannelTypeInvalid, this);
            throw new __1.DMPError(__1.DMPErrors.CHANNEL_TYPE_INVALID);
        }
        let connection = (0, voice_1.joinVoiceChannel)({
            guildId: channel.guild.id,
            channelId: channel.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: this.options.deafenOnJoin
        });
        let _connection;
        try {
            connection = await (0, voice_1.entersState)(connection, voice_1.VoiceConnectionStatus.Ready, 15 * 1000);
            _connection = new StreamConnection_1.StreamConnection(connection, channel);
        }
        catch (err) {
            connection.destroy();
            this.player.emit('error', __1.DMPErrorMessages.VoiceConnectionError, this);
            throw new __1.DMPError(__1.DMPErrors.VOICE_CONNECTION_ERROR);
        }
        this.connection = _connection;
        if (__1.Utils.isStageVoiceChannel(channel)) {
            const _guild = channel.guild;
            const me = _guild.me ? _guild.me : _guild.members.me;
            await me.voice.setSuppressed(false).catch(async (_) => {
                return await channel.guild.members.me.voice.setRequestToSpeak(true).catch(() => null);
            });
        }
        this.connection
            .on('start', (resource) => {
            this.isPlaying = true;
            if (resource?.metadata?.isFirst && resource?.metadata?.seekTime === 0 && resource?.metadata?.firstTimeInQueue) {
                this.player.emit('songFirst', this, this.nowPlaying);
                resource.metadata.flipFirstTimeInQueue();
            }
            else if (resource?.metadata?.firstTimeInQueue) { //Needed if song played has ?t=
                this.player.emit('songFirst', this, this.nowPlaying);
                resource.metadata.flipFirstTimeInQueue();
            }
        })
            .on('end', async (resource) => {
            if (this.destroyed) {
                this.player.emit('queueDestroyed', this);
                return;
            }
            this.isPlaying = false;
            let oldSong = this.songs.shift();
            if (this.songs.length === 0 && this.repeatMode === __1.RepeatMode.DISABLED) {
                this.player.emit('queueEnd', this);
                if (this.options.leaveOnEnd)
                    setTimeout(() => {
                        if (!this.isPlaying)
                            this.leave();
                    }, this.options.timeout);
                return;
            }
            else {
                if (this.repeatMode === __1.RepeatMode.SONG) {
                    this.songs.unshift(oldSong);
                    this.songs[0]._setFirst(false);
                    this.player.emit('songChanged', this, this.songs[0], oldSong);
                    return this.play(this.songs[0], { immediate: true });
                }
                else if (this.repeatMode === __1.RepeatMode.QUEUE) {
                    this.songs.push(oldSong);
                    this.songs[this.songs.length - 1]._setFirst(false);
                    this.player.emit('songChanged', this, this.songs[0], oldSong);
                    return this.play(this.songs[0], { immediate: true });
                }
                this.player.emit('songChanged', this, this.songs[0], oldSong);
                return this.play(this.songs[0], { immediate: true });
            }
        })
            .on('error', (err) => this.player.emit('error', err.message, this));
        return this;
    }
    /**
     * Plays or Queues a song (in a VoiceChannel)
     * @param {Song | string} search
     * @param {PlayOptions} [options=DefaultPlayOptions]
     * @returns {Promise<Song>}
     */
    async play(search, options = __1.DefaultPlayOptions) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        options = Object.assign({}, __1.DefaultPlayOptions, options);
        let { data } = options;
        delete options.data;
        let song = await __1.Utils.best(search, options, this)
            .catch(error => {
            this.player.emit('error', error, this);
            throw new __1.DMPError(error);
        });
        if (!song) { //Checks if song is undefined or not
            this.player.emit('error', __1.DMPErrorMessages.UnknownSong, this);
            throw new __1.DMPError(__1.DMPErrors.UNKNOWN_SONG);
        }
        if (!options.immediate)
            song.data = data;
        if (options.filters && !song.filters) {
            song.filters = options.filters;
        }
        let songLength = this.songs.length;
        if (!options?.immediate && songLength !== 0) {
            if (options?.index >= 0 && ++options.index <= songLength)
                this.songs.splice(options.index, 0, song);
            else
                this.songs.push(song);
            this.player.emit('songAdd', this, song);
            return song;
        }
        else if (!options?.immediate) {
            song._setFirst();
            if (options?.index >= 0 && ++options.index <= songLength)
                this.songs.splice(options.index, 0, song);
            else
                this.songs.push(song);
            this.player.emit('songAdd', this, song);
        }
        else if (options.seek)
            this.songs[0].seekTime = options.seek;
        let quality = this.options.quality;
        song = this.songs[0];
        if (song.seekTime && this.repeatMode === __1.RepeatMode.DISABLED)
            options.seek = song.seekTime; //If on repeat, song will start from the same seeked spot
        let streamSong;
        let i = 0;
        while (!streamSong && i < 5) {
            streamSong = await (0, play_dl_1.stream)(song.url, {
                quality: 'high',
                type: 'audio',
                highWaterMark: 1028 * 1028,
                download: true
            }).catch(error => {
                console.error(error);
            });
            i++;
        }
        if (!streamSong) {
            this.player.emit('error', __1.DMPErrorMessages.SearchIsNull, this);
            const oldSong = this.songs.shift();
            if (this.songs.length != 0) {
                this.player.emit('songChanged', this, this.songs[0], oldSong);
                this.play(this.songs[0], { immediate: true });
            }
            else {
                oldSong.name = 'NOTHING - FORCEFULLY REMOVED';
                this.player.emit('songChanged', this, oldSong, oldSong);
            }
        }
        else {
            let resource;
            if (song.filters) {
                resource = this.connection.createAudioStream((0, Filters_1.createFFmpegStream)(streamSong.stream, { encoderArgs: song.filters, seek: options.seek }), {
                    metadata: song,
                    inputType: voice_1.StreamType.OggOpus
                });
            }
            else {
                resource = this.connection.createAudioStream(streamSong.stream, {
                    metadata: song,
                    inputType: streamSong.type
                });
            }
            setTimeout((_) => {
                if (this.connection) {
                    this.connection.playAudioStream(resource)
                        .then(__ => {
                        this.setVolume(this.options.volume);
                    }).catch(err => {
                        console.error(err);
                    });
                }
            });
        }
        return song;
    }
    /**
     * Plays or Queues a playlist (in a VoiceChannel)
     * @param {Playlist | string} search
     * @param {PlaylistOptions} [options=DefaultPlaylistOptions]
     * @returns {Promise<Playlist>}
     */
    async playlist(search, options = __1.DefaultPlaylistOptions) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        options = Object.assign({}, __1.DefaultPlaylistOptions, options);
        let playlist = await __1.Utils.playlist(search, options, this)
            .catch(error => {
            this.player.emit('error', error, this);
            throw new __1.DMPError(error);
        });
        let songLength = this.songs.length;
        if (options?.index >= 0 && ++options.index <= songLength)
            this.songs.splice(options.index, 0, ...playlist.songs);
        else
            this.songs.push(...playlist.songs);
        this.player.emit('playlistAdd', this, playlist);
        if (songLength === 0) {
            playlist.songs[0]._setFirst();
            await this.play(playlist.songs[0], { immediate: true });
        }
        return playlist;
    }
    /**
     * Seeks the current playing Song
     * @param {number} time
     * @returns {boolean}
     */
    async seek(time) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.isPlaying) {
            this.player.emit('error', __1.DMPErrorMessages.NothingPlaying, this);
            throw new __1.DMPError(__1.DMPErrors.NOTHING_PLAYING);
        }
        if (isNaN(time))
            return;
        if (time < 1)
            time = 0;
        if (time >= this.nowPlaying.milliseconds)
            return this.skip();
        await this.play(this.nowPlaying, {
            immediate: true,
            seek: time
        });
        return true;
    }
    /**
     * Skips the current playing Song and returns it
     * @param {number} [index=0]
     * @returns {Song}
     */
    skip(index = 0) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        this.songs.splice(1, index);
        const skippedSong = this.songs[0];
        this.connection.stop();
        return skippedSong;
    }
    /**
     * Stops playing the Music and cleans the Queue
     * @returns {void}
     */
    stop() {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        this.setRepeatMode(__1.RepeatMode.DISABLED);
        this.clearQueue();
        this.skip();
        this.isPlaying = false;
        if (this.options.leaveOnStop) {
            setTimeout(() => {
                if (!this.isPlaying) //edge case where timer starts then another song is queued
                    this.leave();
            }, this.options.timeout);
        }
    }
    /**
     * Shuffles the Queue
     * @returns {Song[]}
     */
    shuffle() {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        let currentSong = this.songs.shift();
        this.songs = __1.Utils.shuffle(this.songs);
        this.songs.unshift(currentSong);
        return this.songs;
    }
    /**
     * Pause/resume the current Song
     * @param {boolean} [state=true] Pause state, if none it will pause the Song
     * @returns {boolean}
     */
    setPaused(state = true) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        if (!this.isPlaying) {
            this.player.emit('error', __1.DMPErrorMessages.NothingPlaying, this);
            throw new __1.DMPError(__1.DMPErrors.NOTHING_PLAYING);
        }
        return this.connection.setPauseState(state);
    }
    /**
     * Remove a Song from the Queue
     * @param {number} index
     * @returns {Song|undefined}
     */
    remove(index) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        return this.songs.splice(index, 1)[0];
    }
    /**
     * Gets the current volume
     * @type {number}
     */
    get volume() {
        if (!this.connection)
            return __1.DefaultPlayerOptions.volume;
        return this.connection.volume;
    }
    /**
     * Gets the paused state of the player
     * @type {boolean}
     */
    get paused() {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        if (!this.isPlaying) {
            this.player.emit('error', __1.DMPErrorMessages.NothingPlaying, this);
            throw new __1.DMPError(__1.DMPErrors.NOTHING_PLAYING);
        }
        return this.connection.paused;
    }
    /**
     * Sets the current volume
     * @param {number} volume
     * @returns {boolean}
     */
    setVolume(volume) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.connection) {
            this.player.emit('error', __1.DMPErrorMessages.NoVoiceConnection, this);
            throw new __1.DMPError(__1.DMPErrors.NO_VOICE_CONNECTION);
        }
        this.options.volume = volume;
        return this.connection.setVolume(volume);
    }
    /**
     * Returns current playing song
     * @type {?Song}
     */
    get nowPlaying() {
        return this.connection?.resource?.metadata ?? this.songs[0];
    }
    /**
     * Clears the Queue
     * @returns {void}
     */
    clearQueue() {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        let currentlyPlaying = this.songs.shift();
        this.songs = [currentlyPlaying];
    }
    /**
     * Sets Queue repeat mode
     * @param {RepeatMode} repeatMode
     * @returns {boolean}
     */
    setRepeatMode(repeatMode) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (![__1.RepeatMode.DISABLED, __1.RepeatMode.QUEUE, __1.RepeatMode.SONG].includes(repeatMode)) {
            this.player.emit('error', __1.DMPErrorMessages.UnknownRepeatMode, this);
            throw new __1.DMPError(__1.DMPErrors.UNKNOWN_REPEAT_MODE);
        }
        if (repeatMode === this.repeatMode)
            return false;
        this.repeatMode = repeatMode;
        return true;
    }
    /**
     * Creates Progress Bar class
     * @param {ProgressBarOptions} [options]
     * @returns {ProgressBar}
     */
    createProgressBar(options) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        if (!this.isPlaying) {
            this.player.emit('error', __1.DMPErrorMessages.NothingPlaying, this);
            throw new __1.DMPError(__1.DMPErrors.NOTHING_PLAYING);
        }
        return new __1.ProgressBar(this, options);
    }
    /**
     * Set's custom queue data
     * @param {T} data
     * @returns {void}
     */
    setData(data) {
        if (this.destroyed) {
            this.player.emit('error', __1.DMPErrorMessages.QueueDestroyed, this);
            throw new __1.DMPError(__1.DMPErrors.QUEUE_DESTROYED);
        }
        this.data = data;
    }
    /**
     * Disconnects the player
     * @returns {void}
     */
    leave() {
        this.destroyed = true;
        this.connection.leave();
        this.player.deleteQueue(this.guild.id);
    }
}
exports.Queue = Queue;
