const discord = require("discord.js");  // imports the discord lib
const { getData, getPreview, getTracks } = require('spotify-url-info'); //spotify search api
const yts = require('yt-search'); //youtube search api
const
  {
    prefix,
    token
  } = require('./config.json');       //imports settings from config.json
const ytdl = require('ytdl-core');  //youtube dl module

const client = new discord.Client();
const queue = new Map();

//Listener functions
client.once('ready', () => 
{
  console.log('Bot Listening for command!');
});

client.once('reconnecting', () => 
{
  console.log('Reconnecting!');
});

client.once('disconnect', () => 
{
  console.log('Disconnect!');
});

//listen for msgs
client.on('message', async message => 
{

  const serverQueue = queue.get(message.guild.id);
  //check for bot as author of msg
  if (message.author.bot)
    return;
  //check for msg prefix if not for bot return
  if (!message.content.startsWith(prefix))
    return;

  //commands for execution        
  if (message.content.toLowerCase().startsWith(`${prefix}play`) || message.content.toLowerCase().startsWith(`${prefix}ply`)) 
  {
    execute(message, serverQueue);
    return;
  } else if (message.content.toLowerCase().startsWith(`${prefix}skip`)) 
  {
    skip(message, serverQueue);
    return;
  } else if (message.content.toLowerCase().startsWith(`${prefix}stop`)) 
  {
    stop(message, serverQueue);
    return;
  } else if (message.content.toLowerCase().startsWith(`${prefix}queue`)) 
  {
    listQueue(message, serverQueue)
  } else 
  {
    message.channel.send("Do you even Discord? You need to enter a valid command! git gud n try again please");
  }

});

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
  if (!serverQueue) 
  {
    let queueConstruct =
    {
      textChannel: message.channel,
      voiceChannel: vc,
      connection: null,
      songs: [],
      volume: 5,
      playing: true
    };
    try {
      song = await getSongData(args, message, queueConstruct);  
    } catch (error) {
      console.log(error)
    }
    

    queue.set(message.guild.id, queueConstruct);
    queueConstruct.songs.push(song);

    try 
    {
      let connection = await vc.join();
      queueConstruct.connection = connection;
      play(message.guild, queueConstruct.songs[0]);
      console.log(`Playing: ${song.title}`);

    } catch (err) 
    {
      console.log(err);
      queue.delete(message.guild.id);
      return message.channel.send(err);
    }
  } else 
  {
    song = await getSongData(args, message, queue.get(message.guild.id));
    serverQueue.songs.push(song);
    return message.channel.send(`${song.title} has been added to the queue!`);
  }
}

//bot methods
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

  serverQueue.songs = [];
  serverQueue.connection.dispatcher.end();
};

listQueue = (message, serverQueue) => 
{
  if (!message.member.voice.channel)
    return message.channel.send(
      "You have to be in a voice channel Command me!"
    );

  for (let i = 0; i < serverQueue.songs.length; i++)
    message.channel.send(`${i + 1}. ${serverQueue.songs[i].title}`);

  message.channel.send(`Always Remember Don't forget to bring a towel 🌿 `);
}

play = (guild, song) => 
{
  const serverQueue = queue.get(guild.id);
  if (!song) 
  {
    serverQueue.voiceChannel.leave();
    queue.delete(guild.id);
    return;
  }

  const dispatcher = serverQueue.connection
    .play(ytdl(song.url))
    .on("finish", () => {
      serverQueue.songs.shift();
      play(guild, serverQueue.songs[0]);
    })
    .on("error", error => console.error(error));
  dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
  serverQueue.textChannel.send(`Start playing: **${song.title}**`);
}

//Helper functions


async function getSongData(args, message, queueConstruct)
{
  let song = {};
  try 
  {
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
    let alt = await searchAlternative(args[1], message, queueConstruct);
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
async function searchAlternative(songUrl, message, queueConstruct) 
{
  //gets song data from spotify-info-api
  //console.log(songUrl)
  let preview = await getPreview(songUrl)
  //console.log(preview)
  if (preview.type === 'playlist' || preview.type === 'album')
  {
    message.channel.send("Building playlist please wait a moment while i slave away for you 😭" );
    buildPlaylist(songUrl, message, queueConstruct)
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
  songs = [];
  for (let p of playlist) 
  {
    let results = await yts(p.name + ' ' + p.artists[0].name);
    songs.push({ title: results.all[0].title, url: results.all[0].url });
  }
  for (let i = 1; i < songs.length; i++) 
    queueConstruct.songs.push(songs[i]);
  
  //console.log(songs)
  message.channel.send("Playlist complete you may now view the queue 😮‍💨" );
}

client.login(token);