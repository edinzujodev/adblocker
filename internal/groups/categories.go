package groups

// Category is a built-in group the user can only switch on or off.
type Category struct {
	ID          string
	Name        string
	Description string
	// Entries are domains (which cover their subdomains) and keywords (no
	// dot; they block every domain containing them). Keywords are only used
	// where they cannot hit unrelated sites.
	Entries []string
	// Source is a hosts-format list downloaded when the category is switched
	// on, for categories too large to list by hand.
	Source string
}

const stevenBlack = "https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/"

// Categories are the built-in groups, in the order the interface shows them.
var Categories = []Category{
	{
		ID:          "social",
		Name:        "Social media",
		Description: "Facebook, Instagram, TikTok, Snapchat, X, Threads, Reddit, Pinterest, LinkedIn and more.",
		Entries: []string{
			"facebook", "instagram", "tiktok", "snapchat", "pinterest", "twitter", "tumblr", "reddit", "linkedin",
			"fb.com", "fb.me", "fbcdn.net", "fbsbx.com", "instagr.am", "ig.me",
			"threads.net", "threads.com", "x.com", "twimg.com", "t.co",
			"musical.ly", "byteoversea.com", "ibytedtos.com", "ibyteimg.com",
			"snap.com", "sc-cdn.net", "snapkit.com", "redd.it", "pinimg.com", "licdn.com",
			"bsky.app", "bsky.social", "bereal.com", "vk.com",
		},
	},
	{
		ID:          "video",
		Name:        "Video & streaming",
		Description: "YouTube, Netflix, Twitch, Disney+, Prime Video, Max, Hulu, Vimeo and more.",
		Entries: []string{
			"youtube", "netflix", "twitch", "disneyplus", "hbomax", "vimeo", "dailymotion", "crunchyroll",
			"youtu.be", "ytimg.com", "googlevideo.com", "ggpht.com",
			"nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net",
			"jtvnw.net", "ttvnw.net", "disney-plus.net", "dssott.com", "bamgrid.com",
			"primevideo.com", "aiv-cdn.net", "max.com", "hulu.com", "huluim.com", "hulustream.com",
			"dmcdn.net", "kick.com",
		},
	},
	{
		ID:          "gaming",
		Name:        "Gaming",
		Description: "Roblox, Fortnite, Steam, Minecraft, PlayStation, Xbox, Nintendo and browser game sites.",
		Entries: []string{
			"roblox", "fortnite", "epicgames", "minecraft", "playstation", "nintendo", "riotgames", "leagueoflegends", "xbox",
			"rbxcdn.com", "steampowered.com", "steamcommunity.com", "steamstatic.com", "steamcontent.com", "steamserver.net",
			"mojang.com", "battle.net", "blizzard.com", "ea.com", "supercell.com",
			"poki.com", "crazygames.com", "coolmathgames.com", "friv.com", "miniclip.com",
		},
	},
	{
		ID:          "messaging",
		Name:        "Messaging & chat",
		Description: "WhatsApp, Telegram, Discord, Messenger, Signal, Viber, WeChat and Kik.",
		Entries: []string{
			"whatsapp", "telegram", "discord", "viber", "wechat",
			"wa.me", "t.me", "messenger.com", "signal.org", "weixin.qq.com", "kik.com",
		},
	},
	{
		ID:          "shopping",
		Name:        "Shopping",
		Description: "Amazon, eBay, AliExpress, Temu, Shein, Etsy, Wish and Zalando.",
		Entries: []string{
			"aliexpress", "shein", "zalando",
			"amazon.com", "amazon.co.uk", "amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.nl",
			"amazon.se", "amazon.pl", "amazon.ca", "amazon.com.au", "amazon.com.tr",
			"ebay.com", "ebay.co.uk", "ebay.de", "ebay.fr", "ebay.it", "ebay.es", "ebay.nl", "ebay.ca", "ebay.com.au",
			"ebaystatic.com", "ebayimg.com", "alicdn.com", "temu.com", "kwcdn.com",
			"etsy.com", "etsystatic.com", "wish.com",
		},
	},
	{
		ID:          "dating",
		Name:        "Dating",
		Description: "Tinder, Bumble, Hinge, OkCupid, Match, Badoo, Grindr, POF and Happn.",
		Entries: []string{
			"tinder", "okcupid", "badoo", "grindr", "plentyoffish", "lovoo",
			"bumble.com", "bumble.app", "bumbcdn.com", "hinge.co", "match.com", "pof.com", "happn.com",
		},
	},
	{
		ID:          "gambling",
		Name:        "Gambling",
		Description: "Betting, casino and poker sites. Thousands of them, kept up to date.",
		Source:      stevenBlack + "gambling-only/hosts",
	},
	{
		ID:          "adult",
		Name:        "Adult",
		Description: "Porn and other adult sites. Tens of thousands of them, kept up to date.",
		Entries:     []string{"porn"},
		Source:      stevenBlack + "porn-only/hosts",
	},
	{
		ID:          "fakenews",
		Name:        "Fake news",
		Description: "Websites known for spreading fake news. Kept up to date.",
		Source:      stevenBlack + "fakenews-only/hosts",
	},
}
