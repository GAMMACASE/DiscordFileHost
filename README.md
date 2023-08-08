# Discord File Host
This web app provides a way to store and host files in a free and simple way by using discord as its storage platform. This app also comes with some QoL stuff like inline [file embeds](#file-embeds) when you share the file download link on platforms such as discord, and provides anonymous usage for everyone once hosted.

## Overview
### Main app
Simple front end app that supports file drag & drop and manual file selection, it doesn't require any authorization to upload or download files, but you could sign in via Discord oauth to preserve the info about uploaded files, otherwise they would be preserved as long as the session lives (which is configurable).

To share the file you can generate a file link by pressing on tripple dot button, and copying the link. Pasting the provided link in Discord and other media platforms that support custom embeds, would show the corresponding embed related to stored content (you can see all the options in the [file embeds section](#file-embeds))

![Main app view](https://i.imgur.com/UAQKUX1.png)
### File embeds

This section mostly covers Discord as a media embed generator, other platforms might display it differently. Most of the file types would be embedded with a name and size, providing a quick overview of where the link points to:

![Generic file embed](https://i.imgur.com/u2u4lIN.png)

But for certain file types there are custom embeds, like for the mp4 (the only video format supported as of right now), would be embedded with a video player if the platform (in this case Discord) supports such format.

There are certain **sidenote**, such as be aware that DiscordFileHost doesn't do any video postprocessing or compression, so the file would be served as is, which for some high quality/high bitrate assets might take a long time for the Discord to process and start playing the video sample in the player, so preferably do the video compression before uploading the video to file host for the optimal usage.

![Generic video embed](https://i.imgur.com/mZlg547.png)

For files of types jpeg, png, gif, webp and webm they would be embedded as is, so the image would be displayed once Discord (or other platform that supports this format) processed the image.

## Building & Running

This app mainly consists of a server sided nodejs app and a client files, that are served statically. You can build it manually if you plan on developing it further or for any other reason, or you can [download](https://github.com/GAMMACASE/DiscordFileHost/releases) the built files from the release tab if you want to skip building/packaging stages (production only).

Preparation steps:
* Discord server where the files would be hosted, specifically a channel that later would be used;
* Discord bot application, that could be created [here](https://discord.com/developers/applications);
* Invite your discord bot to the discord server you created, once that's done you are ready to build & run the app;

Building & runnig steps:
* Clone this repository to any folder;
* Run ``npm i`` (or ``npm i --include=dev`` if you want dev environment to be setup too);
* Configure the app with the appropriate information (more info [here](#configuring));
* For the production ready server & client files:
  * Run ``npm run package`` to compile/generate static client files to ``./package`` folder that should be served to the end users;
  * Run ``npm run build`` to build all the server code;
  * Run ``npm run server`` to boot up the server itself;
* For the development ready server & client files:
  * Run ``npm run dev-package`` to compile/generate static client files in a watch mode and boot up a static content provider on a port 8080 (this would be an entry point of the app);
  * Run ``npm run build-watch`` to start the build of a server code in a watch mode;
  * Run ``npm run dev-server`` to boot up the server in watch mode;

Optionally:
* You can also use pm2 to run the server via ``pm2 start ./dist/index.js -- -r tsconfig-paths/register .``. Additionally you can configure the pm2 launch options according to its documentation.

If everything went successfully you should be able to access the web app at http://localhost:3005 if you are in a production mode, or http://localhost:8080 if you are in a development mode (that's assuming you are running it on your local machine).

> **NOTE:** It's preferred to run this app and serve packaged content behind/through the reverse proxy like [nginx](https://www.nginx.com/), or any other suitable alternative. As by itself the app has a basic handling of incoming requests. To get it working under a reverse proxy, make sure to follow the [configuring](#configuring) step.

## Configuring

To configure the app, copy/rename the ``.env.example`` file to ``.env`` in the root of the project and configure it filling all the required options. Config consists of the following options:
* Required:
  * File storage:
    * ``DISCORD_CLIENT_TOKEN`` - Discord client bot token of the bot that you created (could be found [here](https://discord.com/developers/applications));
    * ``DISCORD_CHANNEL_ID`` - Discord channel id where the files will be hosted (This channel should be on the same server with the bot);
    * ``METADATA_ENCRYPTION_SECRET`` - Metadata encryption secret that is used to encrypt the file metadata that's posted in the discord channel, **should be exactly 32 symbols long**!
  * Discord oauth:
    * ``DISCORD_CLIENT_ID`` - Discord client id of the bot that you created (could be found [here](https://discord.com/developers/applications));
    * ``DISCORD_CLIENT_SECRET`` - Discord client secret of the bot that you created (could be found [here](https://discord.com/developers/applications));
  * Sessions:
    * ``EXPRESS_JWT_ACCESS_SECRET`` - Access cookie secret, should be set to a **random** string value with 16 or more symbols;
    * ``EXPRESS_JWT_REFRESH_SECRET`` - Refresh cookie secret, should be set to a **random** string value with 16 or more symbols;
    * ``EXPRESS_JWT_ACCESS_LIFETIME`` - Access cookie lifetime, the value is in seconds, should be set to some short term value, like ``3600``;
    * ``EXPRESS_JWT_REFRESH_LIFETIME`` - Refresh cookie lifetime, the value is in seconds, should be set to some long term value, like ``2628000``. Represents the lifetime of the whole session of a client;
* Optional:
  * ``EXPRESS_BEHIND_PROXY`` - Set to ``true`` if your app would be running behind the reverse proxy, any other value would default to ``false``;
  * ``EXPRESS_STATIC_SERVE`` - Set to ``true`` if you want the server itself to serve the packaged files (files should be in the ``./package`` folder), any other value would default to ``false``. Mainly for development purposes, use reverse proxy to serve your content!
  * ``EXPRESS_PORT`` - Port on which server would be opened at, default is ``3005``;
  * ``EXPRESS_HOST`` - Host on which server would be opened at, default is ``127.0.0.1``, leave this at a default value if you are using reverse proxy;
  * ``EXPRESS_SUBPATH`` - Path on which the web app is hosted at (like if you plan on hosting the app at ``https://example.com/discordfilehoster``, the value for the subpath would be ``/discordfilehoster``);
