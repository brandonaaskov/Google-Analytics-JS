#Brightcove Google Analytics JS Plugin
This plugin file allows you to integrate the HTML5 player's events and details with your Google Analytics account. Fairly plug-and-play, you need to only change the account ID in the code to make sure the events get sent to the right place.

##Setup
1.  Open the ga-plugin.js file.
2.  On line 10, change `UA-XXXXX-X` to your Google Analytics account ID. Make sure to keep the quotation marks around the account ID.
3.  Save changes ;)
4.  Upload the ga-plugin.js file to a URL-addressable location.
5.  Make note of that URL, making sure there's a `.js` extension on file in the URL.
6.  In the player's settings in your Brightcove Video Cloud account, choose the plugins tab.
7.  Use the URL from above for the plugin field. If it ends in a `.js` extension, the player will know to use it for the HTML5 players.

##Where to Find the Details in Google Analytics
If you log into your Google Analytics account, in the left-hand navigation, click Content. Under that, click on Events.