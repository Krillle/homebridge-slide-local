// index.js
const { SlideClient } = require('./slide-client');

let Service;
let Characteristic;
let API;

const PLATFORM_NAME = 'SlideLocalPlatform';
const PLUGIN_NAME = 'homebridge-slide-local';

module.exports = (homebridge) => {
  API = homebridge;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerPlatform(PLATFORM_NAME, SlideLocalPlatform);
};

class SlideLocalPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.accessories = new Map();

    this.slides = this.config.slides || [];
    this.defaultPollInterval = this.config.pollInterval ?? 15000;

    if (!Array.isArray(this.slides) || this.slides.length === 0) {
      this.log.warn(
        `${PLUGIN_NAME}: no slides configured. Add a 'slides' array in the plugin configuration.`,
      );
      return;
    }

    if (api) {
      api.on('didFinishLaunching', () => {
        this.log.info(`${PLUGIN_NAME}: didFinishLaunching`);
        this.slides.forEach((slideConfig) => this.addOrUpdateSlide(slideConfig));
      });
    }
  }

  configureAccessory(accessory) {
    // Cached Accessories
    this.accessories.set(accessory.UUID, accessory);
  }

  addOrUpdateSlide(slideConfig) {
    const name = slideConfig.name;
    const host = slideConfig.host;

    if (!name || !host) {
      this.log.warn(
        `${PLUGIN_NAME}: slide missing name or host in config: ${JSON.stringify(slideConfig)}`,
      );
      return;
    }

    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${host}:${name}`);
    let accessory = this.accessories.get(uuid);

    if (accessory) {
      this.log.info(`Updating existing Slide accessory: ${name} (${host})`);
      new SlideAccessory(this.log, accessory, slideConfig, this.defaultPollInterval);
    } else {
      this.log.info(`Registering new Slide accessory: ${name} (${host})`);
      accessory = new this.api.platformAccessory(name, uuid);
      new SlideAccessory(this.log, accessory, slideConfig, this.defaultPollInterval);
      this.accessories.set(uuid, accessory);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }
}

class SlideAccessory {
  constructor(log, accessory, config, defaultPollInterval) {
    this.log = log;
    this.accessory = accessory;
    this.config = config;
    this.name = config.name;
    this.host = config.host;

    const timeout = config.timeout || 5000;
    const username = config.username || 'user';
    const password = config.code || null; // Slide-Code als Passwort

    this.client = new SlideClient(this.host, {
      timeout,
      username: password ? username : null,
      password: password || null,
    });

    accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, 'Innovation in Motion / Slide')
      .setCharacteristic(Characteristic.Model, 'Slide Local')
      .setCharacteristic(Characteristic.SerialNumber, this.host);

    this.service =
      accessory.getService(Service.WindowCovering) ||
      accessory.addService(Service.WindowCovering, this.name);

    // Characteristic Handler
    this.service
      .getCharacteristic(Characteristic.CurrentPosition)
      .onGet(this.handleCurrentPositionGet.bind(this));

    this.service
      .getCharacteristic(Characteristic.TargetPosition)
      .onGet(this.handleTargetPositionGet.bind(this))
      .onSet(this.handleTargetPositionSet.bind(this));

    this.service
      .getCharacteristic(Characteristic.PositionState)
      .onGet(this.handlePositionStateGet.bind(this));

    // Polling
    const pollInterval = config.pollInterval ?? defaultPollInterval;
    if (pollInterval && pollInterval > 0) {
      setInterval(() => {
        this.updateFromDevice().catch((err) => {
          this.log.debug(`Poll error for ${this.name}: ${err.message}`);
        });
      }, pollInterval);
    }
  }

  /**
   * Slide pos (0=open, 1=closed) -> HomeKit percent (0=closed, 100=open)
   */
  slidePosToPercent(pos) {
    const clamped = Math.max(0, Math.min(1, pos));
    return Math.round((1 - clamped) * 100);
  }

  /**
   * HomeKit percent (0=closed, 100=open) -> Slide pos (0=open, 1=closed)
   */
  percentToSlidePos(percent) {
    const p = Math.max(0, Math.min(100, percent));
    return 1 - p / 100;
  }

  async updateFromDevice() {
    try {
      const info = await this.client.getInfo();
      if (!info || typeof info.pos !== 'number') {
        return;
      }

      const currentPercent = this.slidePosToPercent(info.pos);

      this.service.updateCharacteristic(Characteristic.CurrentPosition, currentPercent);
      this.service.updateCharacteristic(Characteristic.TargetPosition, currentPercent);
      this.service.updateCharacteristic(
        Characteristic.PositionState,
        Characteristic.PositionState.STOPPED,
      );
    } catch (err) {
      this.log.debug(`Failed to update Slide info for ${this.name}: ${err.message}`);
    }
  }

  async handleCurrentPositionGet() {
    try {
      const info = await this.client.getInfo();
      if (!info || typeof info.pos !== 'number') {
        throw new Error('No pos in response');
      }
      const percent = this.slidePosToPercent(info.pos);
      this.log.debug(`CurrentPosition(${this.name}) = ${percent}%`);
      return percent;
    } catch (err) {
      this.log.warn(`Error getting current position for ${this.name}: ${err.message}`);
      return 0;
    }
  }

  async handleTargetPositionGet() {
    // Einfachheit: Current = Target
    return this.handleCurrentPositionGet();
  }

  async handleTargetPositionSet(value) {
    const percent = Number(value);
    const slidePos = this.percentToSlidePos(percent);

    this.log.info(
      `Setting target position for ${this.name} to ${percent}% (slide pos=${slidePos.toFixed(
        2,
      )})`,
    );

    const current = await this.handleCurrentPositionGet();
    let state = Characteristic.PositionState.STOPPED;

    if (percent > current) {
      state = Characteristic.PositionState.INCREASING; // wird „offener“
    } else if (percent < current) {
      state = Characteristic.PositionState.DECREASING;
    }

    this.service.updateCharacteristic(Characteristic.PositionState, state);

    try {
      await this.client.setPosition(slidePos);
      setTimeout(() => {
        this.updateFromDevice();
      }, 3000);
    } catch (err) {
      this.log.warn(`Error setting target position for ${this.name}: ${err.message}`);
      this.service.updateCharacteristic(
        Characteristic.PositionState,
        Characteristic.PositionState.STOPPED,
      );
      throw err;
    }
  }

  handlePositionStateGet() {
    return Characteristic.PositionState.STOPPED;
  }
}
