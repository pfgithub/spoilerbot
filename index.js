const Discord = require("discord.js");
const RichEmbed = Discord.RichEmbed;
const PastebinAPI = require("pastebin-js");

const secret = require("./secret");

const pastebin = new PastebinAPI(secret.pastebinkey);
const client = new Discord.Client();


client.on("ready", () => {
	console.log("Started as "+client.user.tag);
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

async function createTextURLFor(str){
	try{
		return `${(await pastebin.createPaste({text: str, title: "Spoiler", privacy: 1}))}`;
	}catch(er){
		console.log(er);
		return `https://dummyimage.com/600x400/ffffff/000000&text=${encodeURIComponent(str.split`\n`.join` - `)}`;
	}
}

const spoilerRegex = />!(.+?)!</gs;

client.on("message", async msg => {
	if(msg.author.bot){return;}

	let content = msg.content; // pings are not pinged in embeds

	if(content.indexOf(">!") > -1 && content.indexOf("!<") > -1){
		await msg.delete();
		await msg.channel.startTyping();

		let spoilInfoNew = true;

		content = await replaceAsync(content, spoilerRegex, async(data, spoilermessage) => {
			return `[Spoiler${spoilInfoNew ? `${(spoilInfoNew = false) || ""} (Hover/Click)` : ""}](${await createTextURLFor(spoilermessage)} "${clean(spoilermessage)}")`;
		});

		let embed = new RichEmbed({
			"title": "Spoiler",
			"description": content,
			"color": 7374587,
			"footer": {
				"text": "The message author can react with ❌ (:x:) to delete this message. | Spoiler Bot"
			},
			"author": {
				"name": msg.member.displayName,
				"url": msg.author.avatarURL,
				"icon_url": msg.author.avatarURL
			}
		});
		msg.channel.stopTyping();
		await msg.channel.send("Spoiler:", {embed:embed});
	}
});

client.login(secret.token);


//
