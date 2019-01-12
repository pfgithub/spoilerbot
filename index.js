const Discord = require("discord.js");
const RichEmbed = Discord.RichEmbed;
const request = require("request");

const secret = require("./secret");

const client = new Discord.Client();
const fs = require("fs");

let aboutMessage = fs.readFileSync("./about.discord.md", "utf8");

client.on("ready", () => {
	console.log("Started as "+client.user.tag); //eslint-ignore-line no-console
	setInterval(updateActivity, 60 * 1000);
	updateActivity();
});

function replaceAsync(str, re, callback) { // https://stackoverflow.com/questions/33631041/javascript-async-await-in-replace
// http://es5.github.io/#x15.5.4.11
	str = String(str);
	var parts = [],
		i = 0;
	if (Object.prototype.toString.call(re) == "[object RegExp]") {
		if (re.global)
			re.lastIndex = i;
		var m;
		while (m = re.exec(str)) {
			var args = m.concat([m.index, m.input]);
			parts.push(str.slice(i, m.index), callback.apply(null, args));
			i = re.lastIndex;
			if (!re.global)
				break; // for non-global regexes only take the first match
			if (m[0].length == 0)
				re.lastIndex++;
		}
	} else {
		re = String(re);
		i = str.indexOf(re);
		parts.push(str.slice(0, i), callback.apply(null, [re, i, str]));
		i += re.length;
	}
	parts.push(str.slice(i));
	return Promise.all(parts).then((strings) => {
		return strings.join("");
	});
}

function clean(str){
	str = str.replace(/(\*|_|`|`|~|\\|<|>|\[|\]"|'|\(|\))/g, "\\$1"); // extra backtick is because my syntax highlighter is broken, it doesn't accept a regex as 1st argument
	//str = str.split`\n`.join` - `;
	str = str.replace(/(@)(everyone|here)/g, "\\$1​\\$2"); // 1 zwsp 2
	return str;
}

function createTextURLFor(str){
	return new Promise((resolve, reject) => {
		let longURL = `https://pfgithub.github.io/spoilerbot/spoiler?s=${encodeURIComponent(str)}`;
		request.post(`https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${secret.firebasekey}`,
			{json: {
				dynamicLinkInfo: {
					domainUriPrefix: "spoilerbot.page.link",
					link: longURL
				},
				suffix: {
					option: "SHORT"
				}
			}},
			(err, httpResponse, body) => {
				if(err || body.error) {
					console.log(err, body);
					return resolve(longURL);
				}
				if(httpResponse.warning){
					console.log("WARN", body.warning); //eslint-ignore-line no-console
				}
				return resolve(body.shortLink);
			});
	});
}

const spoilerRegex = />!(.+?)!</gs;

client.on("message", async msg => {
	if(msg.author.bot){return;}

	let content = msg.content; // pings are not pinged in embeds

	if(content.indexOf(">!") > -1 && content.indexOf("!<") > -1 && content.match(spoilerRegex)){
		// Check permissions
		let guild = msg.guild;
		if(!guild) {return msg.reply("<:failure:508841130503438356> Spoilers cannot be used in PMs. Invite me to a server (say `about` for more info)");}

		let me = guild.me;
		let myperms = msg.channel.memberPermissions(me);

		if(!myperms.has("SEND_MESSAGES")){
			if(guild.id === "264445053596991498" || guild.id === "110373943822540800") {return;} // disables PMs in bot list servers, in case the bot gets triggered too much and needs mute 
			let delme = await msg.author.send(`<:failure:508841130503438356> Spoilers are not available in #${msg.channel.name} because I do not have permission to send messages there.`);
			delme.delete(10*1000);
			return;
		}

		if(!myperms.has("MANAGE_MESSAGES")){
			if(guild.me.hasPermission("MANAGE_MESSAGES")){
				let delme = await msg.reply(`<:failure:508841130503438356> Spoilers are not available in ${msg.channel} because I do not have permission to manage messages.`);
				delme.delete(10*1000);
				return;
			}
			let delme = await msg.reply("<:failure:508841130503438356> Spoilers are not available in this server because I do not have permission to manage messages.");
			delme.delete(10*1000);
			return;
		}

		msg.delete(250); // Attempt at preventing client glitch where messages don't dissapear
		await msg.channel.startTyping();

		let spoilInfoNew = true;

		content = await replaceAsync(content, spoilerRegex, async(data, spoilermessage) => {
			return `[Spoiler${spoilInfoNew ? `${(spoilInfoNew = false) || ""} (Hover/Click)` : ""}](${await createTextURLFor(spoilermessage)} "${clean(spoilermessage)}")`;
		});

		msg.channel.stopTyping();

		content += "\n​";

		if(content.length > 2000){
			let delme = await msg.reply("<:failure:508841130503438356> That spoiler is too close to 2000 characters.");
			delme.delete(10*1000);
			return;
		}
		let embed = new RichEmbed({
			"title": `​`,
			"description": content,
			"color": 7374587,
			"footer": {
				"text": "react ❌ (:x:) to delete | msg me `about` for more info"
			},
			"author": {
				"name": msg.member.displayName,
				"url": msg.author.avatarURL || msg.author.defaultAvatarURL,
				"icon_url": msg.author.avatarURL || msg.author.defaultAvatarURL
			}
		});
		let reply = await msg.reply("Spoiler:", {embed:embed});
		//let reaction = await reply.react("❌");
		//setTimeout(_ => reaction.remove(), 5*1000);
		return;
	}
	if(!msg.guild){
		if(content.indexOf("about") > -1){
			return await msg.channel.send("About:", {embed: {"title":"Spoiler Bot","description":aboutMessage,"url":"https://pfgithub.github.io/spoilerbot/","color":14207324}});
		}
		return await msg.channel.send("Say `about` for info about me."); // Reply required because it contains the user ID.
	}
});

function updateActivity() {
	let count = client.guilds.size;
	client.user.setActivity(`spoiling on >! ${count} !< servers`);
}

function getEmojiKey(emoji) {
	return (emoji.id) ? `${emoji.name}:${emoji.id}` : emoji.name;
}

client.on("raw", async event => { // copied from ipbot
	if (event.t !== "MESSAGE_REACTION_ADD") return;

	const { d: data } = event;
	const user = client.users.get(data.user_id);
	if(!user) return;
	const channel = client.channels.get(data.channel_id);
	if(!channel) return;
	let message;
	try{
	message = await channel.fetchMessage(data.message_id);
	}catch(e){return;}
	if(!message) return;
	if(!message.guild) return;
	const emojiKey = getEmojiKey(data.emoji);
	const reaction = message.reactions.get(emojiKey);

	client.emit("messageReactionAddCustom", reaction, user, message);
});

function userOwnsMessage(user, message){ // true for any message authored by the bot @tting the reactor
	if(message.author.id !== client.user.id) return false;
	if(message.content.indexOf(user.id) === -1) return false;
	return true;
}

client.on("messageReactionAddCustom", async (reaction, user, message) => {
	if(user.bot) return;
	if(userOwnsMessage(user, message) && reaction.emoji.toString() === "❌") {
		message.delete();
	}
});

client.login(secret.token);


//
