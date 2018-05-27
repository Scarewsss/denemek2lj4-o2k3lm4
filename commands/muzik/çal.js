const stripIndents = require('common-tags').stripIndents;
const commando = require('discord.js-commando');
const { RichEmbed } = require('discord.js');
const YouTube = require("simple-youtube-api");
const snekfetch = require("snekfetch");

const premList = ["211566381592739851"];

module.exports = class PlayCommand extends commando.Command {
	constructor(client) {
		super(client, {
			name: 'çal',
			aliases: ['cal', 'play', 'song'],
			group: 'muzik',
			memberName: 'çal',
			description: 'Botun şarkı çalmasını sağlar.',
			examples: ['çal <şarkı ismi>', 'çal <şarkı linki>', 'çal <çalma listesi linki>'],
			guildOnly: true,
            throttling: {
                 usages: 1,
                 duration: 10
             },

            args: [
                {
                    key: 'isim',
                    prompt: 'Ne çalmamı istersin (şarkı ismi, çalma listesi linki ya da şarkı linki yazmalısın)?',
                    type: 'string'
                }
            ]
		});
		this.youtube = new YouTube("AIzaSyBI-kdmHoshPZ9bkxsfIF_8mpivrhCVr3k");
        this.queue = this.client.queue;
	}
	
    async run(msg, args) {
		var embed = await prepareEmbed(msg, 'Kontrol ediliyor...');
		var message = await msg.channel.send({embed});

		/*const voteRes = await snekfetch.get(`https://discordbots.org/api/bots/288310817810546699/check?userId=${msg.author.id}`)
								.set('Authorization', client.config.dbotSites.DBLToken);

		var embed = await prepareEmbed(msg, 'Müzik dinleyebilmek için https://discordbots.org/bot/288310817810546699 adresinden bota upvote vermelisiniz. (eğer upvote verdiyseniz 1 dakika beklemelisiniz)');
		if (!voteRes || !voteRes.body.voted) return message.edit({embed});*/

		const voiceChannel = msg.member.voiceChannel;
		var embed = await prepareEmbed(msg, 'Müzik dinleyebilmek için bir sesli kanalda olmalısın.');
		if (!voiceChannel) return message.edit({embed});
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		var embed = await prepareEmbed(msg, 'Bulunduğun kanalda `KATIL` iznim yok, lütfen müzik çalabilmem için gereken izni verin.');
		if (!permissions.has('CONNECT')) return message.edit({embed});
		var embed = await prepareEmbed(msg, 'Bulunduğun kanalda `KONUŞ` iznim yok, lütfen müzik çalabilmem için gereken izni verin.');
		if (!permissions.has('SPEAK')) return message.edit({embed});
		var embed = await prepareEmbed(msg, 'Bulunduğun kanal dolmuş, katılamıyorum.');
		if (voiceChannel.full) return message.edit({embed});

		var song;

		if (client.isOwner(msg.author.id)) {
			[song] = await getSongs(args.isim);

			return handleVideo(song, msg, voiceChannel, message);
		}

		[song] = await getSongs("ytsearch:" + args.isim);

		var embed = await prepareEmbed(msg, '35 dakikadan uzun şarkıları sadece premium açabilir, isterseniz aylık 8TL ödeyerek premiuma sahip olabilirsiniz. İletişim: Serhan#0001');
		if (song.info.length > 2100000 && !song.info.isStream && !premList.includes(msg.author.id)) return message.edit({embed});

		return handleVideo(song, msg, voiceChannel, message)
	}
}

async function getSongs(string) {
    const res = await snekfetch.get(`http://localhost:2333/loadtracks?identifier=${encodeURIComponent(string)}`)
        .set("Authorization", "youshallnotpass")
        .catch(err => {
            console.error(err);
            return null;
        });
    if (!res) throw "There was an error, try again";
    if (!res.body.length) throw "No tracks found";
    return res.body;
}

async function prepareEmbed(msg, description, thumbnail, requester = false) {
	if (requester) {
		var embed = new RichEmbed()
		.setTitle('Müzik')
		.setDescription(description)
		.setFooter(msg.tag + ' tarafından istendi.', msg.avatarURL)
		.setColor('RANDOM');
	
		if (thumbnail) embed.setThumbnail(thumbnail);
	
		return embed;
	}
	var embed = new RichEmbed()
	.setTitle('Müzik')
	.setDescription(description)
	.setFooter(msg.author.tag + ' tarafından istendi.', msg.author.avatarURL)
	.setColor('RANDOM');

	if (thumbnail) embed.setThumbnail(thumbnail);

	return embed;
}

async function handleVideo(video, msg, voiceChannel, message) {
	const serverQueue = client.queue.get(msg.guild.id);
	//console.log(video);
	const song = {
		id: video.info.identifier,
		title: video.info.title,
		url: `https://www.youtube.com/watch?v=${video.info.identifier}`,
		thumbnail: `https://img.youtube.com/vi/${video.info.identifier}/maxresdefault.jpg`,
		track: video.track,
		requester: msg.author,
		msg: msg,
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			player: null,
			songs: [],
			volume: 50,
			playing: true,
			message: message
		};
		client.queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var player = await lavaManager.join({
				guild: msg.guild.id,
				channel: voiceChannel.id,
				host: "localhost"
			}, { selfdeaf: true });
			queueConstruct.player = player;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			client.queue.delete(msg.guild.id);
			return msg.channel.send(`Bir hata oluştu: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		var requester = await song.requester;
		var message = await serverQueue.message;
		var embed = await prepareEmbed(requester, '🎵 Kuyruğa eklendi: ' + song.title, song.thumbnail, true);
		var bool = await getMessage(message);
		if (bool == true && message.channel.messages.last().embeds[0].description == 'Kontrol ediliyor...') {
			await message.edit({embed});
			if (message.channel.messages.last().embeds[0].description == 'Kontrol ediliyor...') message.channel.messages.last().delete();
		}
		else message.channel.send({embed});
		//console.log(serverQueue.songs);
	}
	return undefined;
}

async function play(guild, song) {
	const serverQueue = client.queue.get(guild.id);

	if (!song) {
		lavaManager.leave(guild.id);
		client.queue.delete(guild.id);
		return;
	}
	//console.log(serverQueue.songs);

	//console.log(serverQueue.player)
	//console.log(serverQueue.songs[0].track)
	serverQueue.player.play(song.track);
	var requester = await serverQueue.songs[0].requester;
	var message = await serverQueue.message;
	var embed = await prepareEmbed(requester, '🎵 Çalınıyor: ' + serverQueue.songs[0].title, serverQueue.songs[0].thumbnail, true);
	var bool = await getMessage(message);
	if (bool == true) message.edit({embed});
	else message.channel.send({embed});
	serverQueue.player.volume(serverQueue.volume)
	
	serverQueue.player.on("error", error => console.error(error));
	serverQueue.player.on("end", async data => {
		//console.log(data.reason)
		var requester = await serverQueue.songs[0].requester;
		var message = await serverQueue.message;
		if (data.reason === "REPLACED") {
			var embed = await prepareEmbed(requester, '🎵 Çalınıyor: ' + serverQueue.songs[0].title, serverQueue.songs[0].thumbnail, true);
			var bool = await getMessage(message);
			if (bool == true) return message.channel.messages.last().edit({embed})
			else return message.channel.send({embed});			
		}
		if (data.reason === "FINISHED") {
			await serverQueue.songs.shift();
			if (serverQueue.songs.length === 0) {
				await lavaManager.leave(guild.id);
				client.queue.delete(guild.id);
				var embed = await prepareEmbed(requester, 'Kuyruk tamamlandı.', '', true);
				var bool = await getMessage(message);
				if (bool == true) return message.channel.messages.last().edit({embed})
				else return message.channel.send({embed})
			} else {
				await serverQueue.player.play(serverQueue.songs[0].track);
				serverQueue.player.volume(serverQueue.volume)
				var embed = await prepareEmbed(requester, '🎵 Çalınıyor: ' + serverQueue.songs[0].title, serverQueue.songs[0].thumbnail, true);
				var bool = await getMessage(message);
				if (bool == true) return message.channel.messages.last().edit({embed})
				else return message.channel.send({embed});
			}
		} else if (data.reason === "STOPPED") {
			await serverQueue.songs.shift();
			await lavaManager.leave(guild.id);
			client.queue.delete(guild.id);
			var embed = await prepareEmbed(requester, 'Müzik kapatıldı.', '', true);
			var bool = await getMessage(message);
			if (bool == true) return message.channel.messages.last().edit({embed})
			else return message.channel.send({embed})
		}
	});
};

async function getMessage(message) {
	message.channel.fetchMessages();
	if (message.channel.messages.size < 1) return false;
	if (message.channel.messages.filter(mesaj => mesaj.author == '288310817810546699').size < 1) return false;
	if (!message.channel.messages.last().embeds[0]) return false;
	var bool1 = await message.channel.messages.last().embeds[0].description.startsWith('🎵');
	var bool2 = await message.channel.messages.last().embeds[0].description == 'Kontrol ediliyor...';
	if (message.channel.messages.last().author.id == client.user.id && bool1 || bool2) return true;
	else return false;
}
