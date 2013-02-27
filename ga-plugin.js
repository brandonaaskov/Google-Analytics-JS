var _gaq = _gaq || [];

(function(){
  var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
  ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
  var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
})();

(function(window, brightcove){
  var _accountID = 'UA-123456-ab',
      _debug = true, //toggle to see console output in your brower's debug tools
      _player = brightcove.api.getExperience(),
      _experience = _player.getModule(brightcove.api.modules.APIModules.EXPERIENCE),
      _videoPlayer = _player.getModule(brightcove.api.modules.APIModules.VIDEO_PLAYER),
      _advertising = _player.getModule(brightcove.api.modules.APIModules.ADVERTISING),
      _currentVideo,
      _customVideoID,
      _mediaComplete = true,
      _mediaPaused = false,
      _progressEventCounter = 0, //this is solely for fixing the seeking issues
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
      _mediaEvents = brightcove.api.events.MediaEvent,
      _adEvents = brightcove.api.events.AdEvent,
      _version = '1.1.1';

  //Google Analytics: Actions
  var _actions = {
    AD_COMPLETE: 'Ad Complete',
    AD_START: 'Ad Start',
    MEDIA_ABANDONED: 'Media Abandoned',
    MEDIA_BEGIN: 'Media Begin',
    MEDIA_COMPLETE: 'Media Complete',
    MEDIA_ERROR: 'Media Error',
    MEDIA_PAUSE: 'Media Pause',
    MEDIA_RESUME: 'Media Resume',
    MILESTONE_25: '25% Milestone Passed',
    MILESTONE_50: '50% Milestone Passed',
    MILESTONE_75: '75% Milestone Passed',
    PLAYER_LOAD: 'Player Load',
    PLAYER_RESIZED_DOWN: 'Player Resized Down',
    PLAYER_RESIZED_UP: 'Player Resized Up',
    SEEK_BACKWARD: 'Seeked Backward',
    SEEK_FORWARD: 'Seeked Forward'
  };

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
    var accountID = getAccountID();
    _gaq.push(['_setAccount', accountID]);

    _localStorageAvailable = isLocalStorageAvailable();
    checkAbandonedVideo(); //this has to happen before updateCurrentVideo() is called
    updateCurrentVideo(function(){
      _gaq.push(function(){
        // var parentURL = (window.location != window.parent.location) ? document.referrer: document.location;
        _gaq.push(['_trackPageview', _customVideoID]);
      });
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

    _advertising.addEventListener(_adEvents.COMPLETE, onAdComplete);
    _advertising.addEventListener(_adEvents.START, onAdStart);
  }
  //----------------------------------------------------------------------


  //---------------------------------------------------------------------- EVENT LISTENERS
  function onMediaBegin(pEvent)
  {
    log('onMediaBegin()', pEvent); //this log might fire twice because it's also being called from onMediaPlay, but it should only track once

    if(_mediaComplete)
    {
      _gaq.push(['_trackEvent', _category, _actions.MEDIA_BEGIN, getCustomEventName(_actions.MEDIA_BEGIN), -1, true]);
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
      _gaq.push(['_trackEvent', _category, _actions.MEDIA_COMPLETE, getCustomEventName(_actions.MEDIA_COMPLETE), -1, true]);
    }
    
    _mediaComplete = true;
  }

  function onMediaError(pEvent)
  {
    log('onMediaError()', pEvent);

    _gaq.push(['_trackEvent', _category, _actions.MEDIA_ERROR, getCustomEventName(_actions.MEDIA_ERROR), -1, true]);
  }

  function onMediaPlay(pEvent)
  {
    log('onMediaPlay()', pEvent);

    checkAccountID();

    if(_mediaComplete)
    {
      onMediaBegin(pEvent);
    }
    else //events that fired during playback of a video (ie not the first mediaPlay event)
    {
      if(_mediaPaused && !_isSeeking)
      {
        _mediaPaused = false;
        _gaq.push(['_trackEvent', _category, _actions.MEDIA_RESUME, getCustomEventName(_actions.MEDIA_RESUME), -1, true]);
      }
    }
  }

  function onMediaProgress(pEvent)
  {
    // log('onMediaProgress()', pEvent);
    
    if(_isSeeking) //must be before _currentPosition gets updated because of the check in here
    {
      if(_progressEventCounter < 3) //3 is a magic number - just need a few events before i can confirm it's actually playing back
      {
        _progressEventCounter++;
      }
      else
      {
        if(pEvent.position > _currentPosition)
        {
          _gaq.push(['_trackEvent', _category, _actions.SEEK_FORWARD, getCustomEventName(_actions.SEEK_FORWARD), -1, true]);
        }
        else
        {
          _gaq.push(['_trackEvent', _category, _actions.SEEK_BACKWARD, getCustomEventName(_actions.SEEK_BACKWARD), -1, true]);
        }

        log('setting _isSeeking to false');
        _isSeeking = false;
      }
    }
    else
    {
      _currentPosition = pEvent.position;
      updateTrackedTime();

      var percent = (pEvent.position * 100)/pEvent.duration;

      // log('percent', percent);

      if((percent >= 25 && percent < 30) && !_milestonesTracked.MILESTONE_25)
      {
        log('Track 25% Milestone');
        _milestonesTracked.MILESTONE_25 = true;
        _gaq.push(['_trackEvent', _category, _actions.MILESTONE_25, getCustomEventName(_actions.MILESTONE_25), -1, true]);
      }
      else if((percent >= 50 && percent < 55) && !_milestonesTracked.MILESTONE_50)
      {
        log('Track 50% Milestone');
        _milestonesTracked.MILESTONE_50 = true;
        _gaq.push(['_trackEvent', _category, _actions.MILESTONE_50, getCustomEventName(_actions.MILESTONE_50), -1, true]);
      }
      else if((percent >= 75 && percent < 80) && !_milestonesTracked.MILESTONE_75)
      {
        log('Track 75% Milestone');
        _milestonesTracked.MILESTONE_75 = true;
        _gaq.push(['_trackEvent', _category, _actions.MILESTONE_75, getCustomEventName(_actions.MILESTONE_75), -1, true]);
      }
    }
    
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
    if(pEvent.position/pEvent.duration > 0.98 && !_mediaComplete)
    {
      onMediaComplete(pEvent);
      resetLocalStorage();
    }
  }

  function onMediaSeekNotify(pEvent)
  {
    if(!_isSeeking) log('onMediaSeekNotify()', pEvent);

    _isSeeking = true;
    _progressEventCounter = 0;
  }

  function onMediaStop(pEvent)
  {
    log('onMediaStop', pEvent);

    setTimeout(function(){
      if(!_mediaComplete && !_mediaPaused && !_isSeeking)
      {
        _mediaPaused = true;
        _gaq.push(['_trackEvent', _category, _actions.MEDIA_PAUSE, getCustomEventName(_actions.MEDIA_PAUSE), -1, true]);
      }
    }, 250);
  }

  function onAdComplete(pEvent)
  {
    _gaq.push(['_trackEvent', _category, _actions.AD_COMPLETE, getCustomEventName(_actions.AD_COMPLETE), -1, true]);
  }

  function onAdStart(pEvent)
  {
    _gaq.push(['_trackEvent', _category, _actions.AD_START, getCustomEventName(_actions.AD_START), -1, true]);
  }
  //----------------------------------------------------------------------


  //---------------------------------------------------------------------- HELPER FUNCTIONS
  function updateCurrentVideo(pCallback)
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
    _progressEventCounter = 0;
    resetMilestoneFlags();

    log('updateCurrentVideo', _currentVideo);

    if(pCallback) pCallback();
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
    if(!(JSON.stringify && JSON.parse))
    {
      return false;
    }

    try 
    {
      return 'localStorage' in window && window.localStorage !== null;
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
        _gaq.push(['_trackEvent', _category, _actions.MEDIA_ABANDONED, getCustomEventName(_actions.MEDIA_ABANDONED), -1, true]);
      }

      resetLocalStorage();
    }
  }
    
  function getCustomVideoID(pCurrentVideo)
  {
    log('getCustomVideoID()');

    return pCurrentVideo.id + ' | ' + pCurrentVideo.displayName;
  }

  function getCustomEventName(pEventName)
  {
    return _customVideoID + ' | ' + pEventName;
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

    return _accountID;
  }

  function checkAccountID()
  {
    if(_debug)
    {
      _gaq.push(function() {
        var pageTracker = window._gat._getTrackerByName(); // Gets the default tracker.
        var accountID = pageTracker._getAccount();
        log('Checking to make sure account id is set', accountID);
      });
    }
  }

  function log(pMessage, pObject)
  {
    if(_debug)
    {
      var message = 'GA-HTML5 ('+ _version +'): ' + pMessage;

      (!pObject) ? console.log(message) : console.log(message, pObject);
    }
  }
  //----------------------------------------------------------------------
}(window, window.brightcove));