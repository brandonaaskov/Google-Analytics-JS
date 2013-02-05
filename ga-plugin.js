var _gaq = _gaq || [];

(function(){
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

(function(){
  var _accountID = '',
  _debug = true, //toggle to see console output in your brower's debug tools
  _experience,
  _videoPlayer,
  _currentVideo,
  _customVideoID,
  _mediaComplete = true,
  _mediaPaused = false,
  _isSeeking = false,
  _milestonesTracked = {
    MILESTONE_25: false,
    MILESTONE_50: false,
    MILESTONE_75: false
  },
  _experienceID,
  _category, //the category string to be used for all the event tracking
  _timeWatched = 0,
  _currentPosition,
  _previousTimestamp,
  _localStorageAvailable = false,
  _mediaEvents = brightcove.api.events.MediaEvent;

  //Google Analytics: Actions
  var _actions = {
    AD_START: 'Ad Start',
    AD_PAUSE: 'Ad Paused',
    AD_POSTROLLS_COMPLETE: 'Ad Postrolls Complete',
    AD_RESUME: 'Ad Resume',
    AD_COMPLETE: 'Ad Complete',
    ENTER_FULLSCREEN: 'Fullscreen Entered',
    EXIT_FULLSCREEN: 'Fullscreen Exited',
    MEDIA_ABANDONED: 'Media Abandoned',
    MEDIA_BEGIN: 'Media Begin',
    MEDIA_ERROR: 'Media Error',
    MEDIA_PAUSE: 'Media Pause',
    MEDIA_RESUME: 'Media Resume',
    MEDIA_COMPLETE: 'Media Complete',
    MILESTONE_25: '25% Milestone Passed',
    MILESTONE_50: '50% Milestone Passed',
    MILESTONE_75: '75% Milestone Passed',
    PLAYER_LOAD: 'Player Load',
    SEEK_FORWARD: 'Seeked Forward',
    SEEK_BACKWARD: 'Seeked Backward',
    VIDEO_LOAD: 'Video Load'
  };
  
  //grab API Modules
  var player = brightcove.api.getExperience();
  _experience = player.getModule(brightcove.api.modules.APIModules.EXPERIENCE);
  _videoPlayer = player.getModule(brightcove.api.modules.APIModules.VIDEO_PLAYER);

  _experience.getExperienceID(function(pExperienceID){
    _experienceID = pExperienceID;
    _category = 'Brightcove (' + _experienceID + ')';
  });

  if(_experience.getReady())
  {
    initialize();
  }
  else
  {
    _experience.addEventListener(brightcove.api.events.ExperienceEvent.TEMPLATE_READY, initialize);
  }
  

  //---------------------------------------------------------------------- INIT
  function initialize()
  {
    log('window.location.href', window.location.href);
    log('window.location.href', window.location.href);

    _localStorageAvailable = isLocalStorageAvailable();
    checkAbandonedVideo(); //this has to happen before updateCurrentVideo() is called
    updateCurrentVideo();

    _gaq.push(function(){
      var accountID = getAccountID();
      log('account id', accountID);
      _gat._getTracker(accountID, 'bcGA'); //initialize google analytics tracker
    });

    _gaq.push(function(){
      var parentURL = (window.location != window.parent.location) ? document.referrer: document.location;
      _gaq.push(['bcGA._trackPageview', parentURL]);
    });

    //setup event listeners
    _videoPlayer.addEventListener(_mediaEvents.BEGIN, onMediaBegin);
    _videoPlayer.addEventListener(_mediaEvents.CHANGE, onMediaChange);
    _videoPlayer.addEventListener(_mediaEvents.COMPLETE, onMediaComplete);
    _videoPlayer.addEventListener(_mediaEvents.ERROR, onMediaError);
    _videoPlayer.addEventListener(_mediaEvents.PLAY, onMediaPlay);
    _videoPlayer.addEventListener(_mediaEvents.PROGRESS, onMediaProgress);
    _videoPlayer.addEventListener(_mediaEvents.SEEK_NOTIFY, onMediaSeekNotify);
    _videoPlayer.addEventListener(_mediaEvents.STOP, onMediaStop);
  }
  //----------------------------------------------------------------------


  //---------------------------------------------------------------------- EVENT LISTENERS
  function onMediaBegin(pEvent)
  {
    log('onMediaBegin()', pEvent); //this log might fire twice because it's also being called from onMediaPlay, but it should only track once

    if(_mediaComplete)
    {
      _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_BEGIN, _customVideoID, -1, true]);
    }

    _mediaComplete = false;
  }

  function onMediaChange(pEvent)
  {
    log('onMediaChange()', pEvent);

    updateCurrentVideo();
  }

  function onMediaComplete(pEvent)
  {
    log('onMediaComplete()', pEvent); //this log might fire twice because it's also being called from onMediaProgress, but it should only track once

    if(!_mediaComplete)
    {
      _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_COMPLETE, _customVideoID, -1, true]);
    }
    
    _mediaComplete = true;
  }

  function onMediaError(pEvent)
  {
    log('onMediaError()', pEvent);

    _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_ERROR, _customVideoID, -1, true]);
  }

  function onMediaPlay(pEvent)
  {
    log('onMediaPlay()', pEvent);

    if(_mediaComplete)
    {
      onMediaBegin(pEvent);
    }
    else //events that fired during playback of a video (ie not the first mediaPlay event)
    {
      if(_mediaPaused && !_isSeeking)
      {
        _mediaPaused = false;
        _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_RESUME, _customVideoID, -1, true]);
      }
    }
  }

  function onMediaProgress(pEvent)
  {
    log('onMediaProgress()', pEvent);

    if(_isSeeking) //must be before _currentPosition gets updated because of the check in here
    {
      if(pEvent.position > _currentPosition)
      {
        _gaq.push(['bcGA._trackEvent', _category, _actions.SEEK_FORWARD, _customVideoID, -1, true]);
      }
      else
      {
        _gaq.push(['bcGA._trackEvent', _category, _actions.SEEK_BACKWARD, _customVideoID, -1, true]);
      }

      log('setting _isSeeking to false');
      _isSeeking = false;
    }

    _currentPosition = pEvent.position;
    updateTrackedTime();
    
    /*
    This will track the media complete event when the user has watched 98% or more of the video. 
    Why do it this way and not use the Player API's event? The mediaComplete event will 
    only fire once, so if a video is replayed, it won't fire again. Why 98%? If the video's 
    duration is 3 minutes, it might really be 3 minutes and .145 seconds (as an example). When 
    we track the position here, there's a very high likelihood that the current position will 
    never equal the duration's value, even when the video gets to the very end. We use 98% since 
    short videos may never see 99%: if the position is 15.01 seconds and the video's duration 
    is 15.23 seconds, that's just over 98% and that's not an unlikely scenario. If the video is 
    long-form content (let's say an hour), that leaves 1.2 minutes of video to play before the 
    true end of the video. However, most content of that length has credits where a user will 
    drop off anyway, and in most cases content owners want to still track that as a media 
    complete event. Feel free to change this logic as needed, but do it cautiously and test as 
    much as you possibly can!
    */
    if(pEvent.position/pEvent.duration > .98 && !_mediaComplete)
    {
      onMediaComplete(pEvent);
      resetLocalStorage();
    }

    if(!_isSeeking)
    {
      var percent = (pEvent.position * 100)/pEvent.duration;

      // log('percent', percent);

      if((percent >= 25 && percent < 30) && !_milestonesTracked.MILESTONE_25)
      {
        log('Track 25% Milestone');
        _milestonesTracked.MILESTONE_25 = true;
        _gaq.push(['bcGA._trackEvent', _category, _actions.MILESTONE_25, _customVideoID, -1, true]);
      }
      else if((percent >= 50 && percent < 55) && !_milestonesTracked.MILESTONE_50)
      {
        log('Track 50% Milestone');
        _milestonesTracked.MILESTONE_50 = true;
        _gaq.push(['bcGA._trackEvent', _category, _actions.MILESTONE_50, _customVideoID, -1, true]);
      }
      else if((percent >= 75 && percent < 80) && !_milestonesTracked.MILESTONE_75)
      {
        log('Track 75% Milestone');
        _milestonesTracked.MILESTONE_75 = true;
        _gaq.push(['bcGA._trackEvent', _category, _actions.MILESTONE_75, _customVideoID, -1, true]);
      }
    }
  }

  function onMediaSeekNotify(pEvent)
  {
    if(!_isSeeking) log('onMediaSeekNotify()', pEvent);

    _isSeeking = true;
  }

  function onMediaStop(pEvent)
  {
    log('onMediaStop', pEvent);

    if(!_mediaComplete && !_mediaPaused && !_isSeeking)
    {
      _mediaPaused = true;
      _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_PAUSE, _customVideoID, -1, true]);
    }
  }
  //----------------------------------------------------------------------


  //---------------------------------------------------------------------- HELPER FUNCTIONS
  function updateCurrentVideo()
  {
    log('updateCurrentVideo()');

    _videoPlayer.getCurrentVideo(function(pVideoDTO){
      _currentVideo = pVideoDTO;
      _customVideoID = getCustomVideoID(_currentVideo);

      if(_localStorageAvailable)
      {
        localStorage.setItem('abandonedVideo', JSON.stringify(_currentVideo));
      }
    });

    _mediaComplete = true;
    _timeWatched = 0;
    resetMilestoneFlags();

    log('updateCurrentVideo', _currentVideo);
  }

  function updateTrackedTime()
  {
    var currentTimestamp = new Date().getTime();
    var timeElapsed = (currentTimestamp - _previousTimestamp)/1000;
    _previousTimestamp = currentTimestamp;
    
    //check if it's more than 2 seconds in case the user paused or changed their local time or something
    if(timeElapsed < 2) 
    {
      _timeWatched += timeElapsed;
    }  
    
    //update time watched in case the user bails out before mediaComplete
    if(!_mediaComplete) //make sure mediaComplete hasn't fired yet, otherwise it gets set to null and then repopulated: not what we want
    {
      localStorage.setItem('abandonedTimeWatched', _timeWatched); //automatically gets flushed when flash player is closed 
    } 
  }

  function isLocalStorageAvailable()
  {
    if(!(JSON['stringify'] && JSON['parse']))
    {
      return false;
    }

    try 
    {
      return 'localStorage' in window && window['localStorage'] !== null;
    } 
    catch(pError) 
    {
      return false;
    }
  }

  function checkAbandonedVideo()
  {
    if(_localStorageAvailable)
    {
      var abandonedVideo = localStorage.getItem('abandonedVideo');
      var abandonedTimeWatched = localStorage.getItem('abandonedTimeWatched');

      if(abandonedVideo && abandonedTimeWatched)
      {
        var customVideoID = getCustomVideoID(JSON.parse(localStorage.abandonedVideo));
        var timeWatched = Math.round(localStorage.abandonedTimeWatched);
        
        log("Tracking video that was previously uncompleted: " + customVideoID + " : " + timeWatched);
        _gaq.push(['bcGA._trackEvent', _category, _actions.MEDIA_ABANDONED, customVideoID, -1, true]);
      }

      resetLocalStorage();
    }
  }
    
  function getCustomVideoID(pCurrentVideo)
  {
    log('getCustomVideoID()');

    return pCurrentVideo.id + " | " + pCurrentVideo.displayName;
  }

  function resetMilestoneFlags()
  {
    _milestonesTracked.MILESTONE_25 = false;
    _milestonesTracked.MILESTONE_50 = false;
    _milestonesTracked.MILESTONE_75 = false;
  }

  function resetLocalStorage()
  {
    log('resetLocalStorage()');

    if(_localStorageAvailable)
    {
      //empty these since we don't want to track it when someone comes back
      localStorage.removeItem('abandonedVideo');
      localStorage.removeItem('abandonedTimeWatched');
    }
  }

  //checks the URL of the plugin to grab the account id if it exists
  function getAccountID()
  {
    if(_accountID !== 'UA-XXXXX-X')
    {
      return _accountID;
    }
    else
    {
      alert("You haven't added the accountID parameter to your Google Analytics (JS) plugin URL."); 
    }

    return;
  }

  function log(pMessage, pObject)
  {
    var message = 'GA-HTML5: ' + pMessage;

    (!pObject) ? console.log(message) : console.log(message, pObject);
  }
  //----------------------------------------------------------------------
}());