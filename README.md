<p align="center">
<img src="https://github.com/bram-is/homebridge-slide-shutter/raw/main/_assets/header.png" width="286">
</p>

<div align="center">

# Homebridge Slide Local

[![Downloads](https://img.shields.io/npm/dt/homebridge-slide-local)](https://www.npmjs.com/package/homebridge-slide-shulocaltter)
[![Version](https://img.shields.io/npm/v/homebridge-slide-local)](https://www.npmjs.com/package/homebridge-slide-local)

</div>


## Homebridge plugin for [Slide](https://nl.slide.store/) by Innovation in Motion

Brings back Slide to HomeBridge, after native HomeKit support has been removed from Slide.



## Features

- Supports local API with authentification (API v1) and without authentification (API 2 after 05/2024 update).
- Updates state correctly in HomeKit, also when controlled from an external source (eg. Slide app).

## Set Slide to local-mode
Before you can use the Slide local integration or API, you have to make sure the slide is configured for the local API. By default, the Slide connects to the cloud API, but it is possible to use the local API. Only one of them can be active. To switch between the cloud and local API, do the following:

Press the reset button 2x:
- the LED flashes 5x fast: cloud API disabled, local API enabled
- the LED flashes 2x slow: local API disabled, cloud API enabled

## Installation

Install via HomeBridge `Plugins` by searching for for `homebridge-slide-local`. Configure via settings in homebridge, or enter the following details into the ~/.homebridge/config.json:

```JSON
{
  "platforms":[
    {
        "name": "Slide Local",
        "pollInterval": 15000,
        "slides": [
            {
                "name": "Name you want in Home App",
                "host": "IP of your Slide",
                "code": "Device Code of your Slide",
                "username": "user",
                "timeout": 5000
            }
        ],
        "platform": "SlideLocalPlatform"
    }
  ]
 }
```

The Device Code of your Slide is needed as login, in case your Slide requires an authentification. Find the device code on the device itself or on the instructions sheet, which came with your Slide.

Now start or restart homebridge and all slides should appear in the HomeKit app.