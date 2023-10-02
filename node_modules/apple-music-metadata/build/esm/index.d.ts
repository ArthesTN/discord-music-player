export declare function EnableDebug(): void;
export interface Artist {
    name: string;
    url: string;
}
export interface Track {
    artist: Artist;
    duration: number;
    title: string;
    url: string;
    type: "song";
}
export interface RawAlbum {
    artist: Artist;
    description: string;
    numTracks: number;
    title: string;
    tracks: Track[];
    type: "album";
}
export interface RawPlaylist {
    creator: Artist;
    description: string;
    numTracks: number;
    title: string;
    tracks: Track[];
    type: "playlist";
}
declare function search(url: string): Promise<RawPlaylist | RawAlbum | Track | null>;
export default search;
