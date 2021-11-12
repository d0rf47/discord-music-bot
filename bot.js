const discord = require("discord.js");  // imports the discord lib
const { getData, getPreview, getTracks } = require('spotify-url-info'); //spotify search api
const yts = require('yt-search'); //youtube search api
const
{
    prefix,
    token
} = require('./config.json');       //imports settings from config.json
const ytdl = require('ytdl-core');  //youtube dl module


class musicBot {
    client = new discord.Client();
    queue = new Map();

    constructor() { };

    initBot() {
        this.client.login(token);

        //Listener functions
        this.client.once('ready', () => {
            console.log('Bot Listening for command!');
        });

        this.client.once('reconnecting', () => {
            console.log('Reconnecting!');
        });

        this.client.once('disconnect', () => {
            console.log('Disconnect!');
        });

        this.client.on('message', async message => 
        {
            
            const msgContent = message.content.toLowerCase();
            // console.log(msgContent)
            const serverQueue = this.queue.get(message.guild.id);
            //check for bot as author of msg
            if (message.author.bot)
                return;
            //check for msg prefix if not for bot return
            if (!message.content.startsWith(prefix))
                return;

            switch (true) 
            {
                case msgContent.startsWith(`${prefix}play`):
                    this.execute(message, serverQueue);
                    break;
                case msgContent.startsWith(`${prefix}ply`):
                    this.execute(message, serverQueue);
                    break;
                case msgContent.startsWith(`${prefix}skip`):
                    this.skip(message, serverQueue);
                    break;
                case msgContent.startsWith(`${prefix}stop`):
                    this.stop(message, serverQueue);
                    break;
                case msgContent.startsWith(`${prefix}queue`):
                    this.listQueue(message, serverQueue);
                    break;    
                default:
                    message.channel.send("Do you even Discord? You need to enter a valid command! git gud n try again please");
                    break;
            }
        });        

        this.client.on("error", (error) =>
        {
            console.log(error)            
        });
    }

    //Bot Methods

    //uses ytdl lib to get song data for playing
    execute = async (message, serverQueue) => 
    {

        const args = message.content.split(" ");   //splits the message command from the url for playing music from
        const vc = message.member.voice.channel;        
        let song = {};

        if (!vc)
            return message.channel.send("Must be in Voice channel to play music!");
        const permission = vc.permissionsFor(message.client.user);
        if (!permission.has("CONNECT") || !permission.has("SPEAK"))
            return message.channel.send("Invalid Permissions to play in this Voice Channel!");

        //check queue for exstiance
        // if no queue build queue and fetch song data
        if (!serverQueue) {
            let queueConstruct =
            {
                textChannel: message.channel,
                voiceChannel: vc,
                connection: null,
                songs: [],
                volume: 5,
                playing: true
            };
            try 
            {
                song = await this.getSongData(args, message, queueConstruct);
                this.queue.set(message.guild.id, queueConstruct);
                queueConstruct.songs.push(song);
                let connection = await vc.join();
                queueConstruct.connection = connection;
                this.play(message.guild, queueConstruct.songs[0]);
                console.log(`Playing: ${song.title}`);
            } catch (error) 
            {
                console.log("line 115",  error);
                if(error instanceof TypeError)
                    return message.channel.send("Are you sure that is a valid Url?")
                else
                    return message.channel.send("I seem to have ran into trouble maybe @d0rf47#5367 should do something")
            }
        } else 
        {
            try 
            {
                song = await this.getSongData(args, message, this.queue.get(message.guild.id));
                serverQueue.songs.push(song);    
            } catch (error) 
            {
                console.log(error)                
                return message.channel.send("I seem to have ran into trouble maybe @d0rf47#5367 should do something")
            }            
            return message.channel.send(`${song.title} has been added to the queue!`);
        }
    }

    skip = (message, serverQueue) => 
    {
        if (!message.member.voice.channel)
            return message.channel.send(
                "You have to be in a voice channel to stop the music!"
            );

        if (!serverQueue)
            return message.channel.send("There is no song that I could skip!");

        message.channel.send("👌");
        serverQueue.connection.dispatcher.end();
    }

    stop = (message, serverQueue) => 
    {
        if (!message.member.voice.channel)
            return message.channel.send(
                "You have to be in a voice channel to stop the music!"
            );
        if(serverQueue && serverQueue.songs)
        {
            serverQueue.songs = [];
            serverQueue.connection.dispatcher.end();
        }else
            return;
            
    };

    listQueue = (message, serverQueue) => 
    {
        let queueString = "";
        if (!message.member.voice.channel)
            return message.channel.send(
                "You have to be in a voice channel to Command me!"
            );

        for (let i = 0; i < serverQueue.songs.length; i++)
            queueString += `${i + 1}. ${serverQueue.songs[i].title} \n`;

        message.channel.send(queueString);
        message.channel.send(`Don't forget to bring a towel 🌿 `);
    }

    play = (guild, song) => 
    {
        const serverQueue = this.queue.get(guild.id);
        if (!song)
        {
            serverQueue.voiceChannel.leave();
            this.queue.delete(guild.id);
            return;
        }

        const dispatcher = serverQueue.connection
            .play(ytdl(song.url))
            .on("finish", () => {
                serverQueue.songs.shift();
                this.play(guild, serverQueue.songs[0]);
            })
            .on("error", error => console.error(error));
        dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
        serverQueue.textChannel.send(`Start playing: **${song.title}**`);
    }

    //Helper functions
    getSongData = async (args, message, queueConstruct) => 
    {
        let song = {};
        try {
            const songData = await ytdl.getInfo(args[1]);  // uses second index of message via arg array (song url) to get data
            song =
            {
                title: songData.videoDetails.title,         // song title for display 
                url: songData.videoDetails.video_url        // actual youtube url used to decode video and play
            };
        // used to handle error thrown for spotify songs
        } catch (error) 
        {
            // spotify alternative options 
            let alt = await this.searchAlternative(args[1], message, queueConstruct);
            song =
            {
                title: alt.title,
                url: alt.url
            }
        }
        return song;
    }

    /**
     * Searches youtube for songs that match spotify 
     * song data
     * selects first matching result and returns youtube data
     * @param {string} songUrl 
     * @returns {result object}
     */
    searchAlternative = async (songUrl, message, queueConstruct) =>
    {
        //gets song data from spotify-info-api
        //console.log(songUrl)
        let preview = await getPreview(songUrl);
        //console.log(preview)
        if (preview.type === 'playlist' || preview.type === 'album') {
            message.channel.send("Building playlist please wait a moment while i slave away for you 😭");
            this.buildPlaylist(songUrl, message, queueConstruct)
        }

        //searches youtube based on artist and track and selects first result
        let results = await yts(preview.track + ' ' + preview.artist);

        return results.all[0];
    }

    /**
     * Creates a playlist from a spotify playlist 
     * iterates playlist tracks
     * searches youtube for matches
     * adds to queue once complete 
     * @param {string} songUrl 
     * @returns {null}
     */
    buildPlaylist = async (songUrl, message, queueConstruct) => 
    {
        let playlist = await getTracks(songUrl)
        let songs = [];
        for (let p of playlist) 
        {
            let results = await yts(p.name + ' ' + p.artists[0].name + ' audio');
            songs.push({ title: results.all[0].title, url: results.all[0].url });
        }
        //possibly condense this loop
        for (let i = 1; i < songs.length; i++)
            queueConstruct.songs.push(songs[i]);

        //console.log(songs)
        message.channel.send("Playlist complete you may now view the queue 😮‍💨");
    }
    
}

module.exports = musicBot;