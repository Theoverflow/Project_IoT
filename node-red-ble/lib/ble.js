var events = require('events');
var util = require('util');

var noble;// = require('noble');

var DEVICE_NAME_UUID = '2a00';

var IR_TEMPERATURE_DATA_UUID = 'f000aa0104514000b000000000000000';
var ACCELEROMETER_DATA_UUID = 'f000aa1104514000b000000000000000';
var HUMIDITY_DATA_UUID = 'f000aa2104514000b000000000000000';


function BLE(peripheral) {
    this._peripheral = peripheral;
    this._services = {};
    this._characteristics = {};

    this.uuid = peripheral.uuid;

	this._peripheral.on('disconnect', this.onDisconnect.bind(this));
}

util.inherits(BLE, events.EventEmitter);

BLE.discover = function (callback, uuid) {
	var onDiscover = function (peripheral) {
		util.log("Found : " + peripheral.advertisement.localName);
		if (uuid == undefined || uuid == peripheral.uuid){
            noble.removeListener('discover', onDiscover);
            noble.stopScanning();
            var device = new BLE(peripheral);
            callback(device);
        }
    };

	if(noble != undefined || noble != null){
		noble.removeListener('discover', onDiscover);
		noble.removeAllListeners();
		noble.stopScanning();
	}
	noble = require('noble');

    if (noble.state == 'poweredOn') {
        noble.on('discover', onDiscover);
        noble.startScanning();
    } else {
        noble.once('stateChange', function () {
            noble.on('discover', onDiscover);
            noble.startScanning();
        });
    }
};

BLE.prototype.connect = function (callback) {
    this._peripheral.connect(callback);
};

BLE.prototype.disconnect = function (callback) {
    this._peripheral.disconnect(callback);
	delete noble;
};

BLE.prototype.onDisconnect = function() {
	this.emit('disconnect');
};

BLE.prototype.discoverServicesAndCharacteristics = function (callback) {
    this._peripheral.discoverAllServicesAndCharacteristics(function (error, services, characteristics) {
        if (error === null) {
            for (var i in services) {
                var service = services[i];
                this._services[service.uuid] = service;
            }

            for (var j in characteristics) {
                var characteristic = characteristics[j];

                this._characteristics[characteristic.uuid] = characteristic;
            }
        }

        callback();
    }.bind(this));
};

BLE.prototype.writeCharacteristic = function (uuid, data, callback) {
    this._characteristics[uuid].write(data, false, callback);
};

BLE.prototype.readDataCharacteristic = function (uuid, callback) {
    this._characteristics[uuid].read(function (error, data) {
        callback(data);
    });
};

BLE.prototype.readStringCharacteristic = function (uuid, callback) {
    this.readDataCharacteristic(uuid, function (data) {
        callback(data.toString());
    });
};

BLE.prototype.readDeviceName = function (callback) {
    this.readStringCharacteristic(DEVICE_NAME_UUID, callback);
};

BLE.prototype.readHandle = function (handle, callback) {
    this._peripheral.readHandle(handle, callback)
}

BLE.prototype.writeHandle = function (handle, data, withoutResponse, callback) {
    this._peripheral.writeHandle(handle, data, withoutResponse, callback)
}

BLE.prototype.onAccelerometerChange = function (data) {
    this.convertAccelerometerData(data, function (x, y, z) {
        this.emit('accelerometerChange', x, y, z);
    }.bind(this));
};

BLE.prototype.convertAccelerometerData = function (data, callback) {
    var x = data.readInt8(0) / 16.0;
    var y = data.readInt8(1) / 16.0;
    var z = data.readInt8(2) / 16.0;

    callback(x, y, z);
};

BLE.prototype.onIrTemperatureChange = function(data) {
	this.convertIrTemperatureData(data, function(objectTemperature, ambientTemperature) {
		this.emit('irTemperatureChange', objectTemperature, ambientTemperature);
	}.bind(this));
};

BLE.prototype.convertIrTemperatureData = function(data, callback) {
	// For computation refer :  http://processors.wiki.ti.com/index.php/SensorTag_User_Guide#IR_Temperature_Sensor

	var ambientTemperature = data.readInt16LE(2) / 128.0;

	var Vobj2 = data.readInt16LE(0) * 0.00000015625;
	var Tdie2 = ambientTemperature + 273.15;
	var S0 = 5.593 * Math.pow(10, -14);
	var a1 = 1.75 * Math.pow(10 ,-3);
	var a2 = -1.678 * Math.pow(10, -5);
	var b0 = -2.94 * Math.pow(10, -5);
	var b1 = -5.7 * Math.pow(10, -7);
	var b2 = 4.63 * Math.pow(10,-9);
	var c2 = 13.4;
	var Tref = 298.15;
	var S = S0 * (1 + a1 * (Tdie2 - Tref) + a2 * Math.pow((Tdie2 - Tref), 2));
	var Vos = b0 + b1 * (Tdie2 - Tref) + b2 * Math.pow((Tdie2 - Tref), 2);
	var fObj = (Vobj2 - Vos) + c2 * Math.pow((Vobj2 - Vos), 2);
	var objectTemperature = Math.pow(Math.pow(Tdie2, 4) + (fObj/S), 0.25);
	objectTemperature = (objectTemperature - 273.15);

	callback(objectTemperature, ambientTemperature);
};

BLE.prototype.onHumidityChange = function(data) {
	this.convertHumidityData(data, function(temperature, humidity) {
		this.emit('humidityChange', temperature, humidity);
	}.bind(this));
};

BLE.prototype.convertHumidityData = function(data, callback) {
	var temperature = -46.85 + 175.72 / 65536.0 * data.readUInt16LE(0);
	var humidity = -6.0 + 125.0 / 65536.0 * (data.readUInt16LE(2) & ~0x0003);

	callback(temperature, humidity);
};

BLE.prototype.notifyCharacteristic = function (uuid, notify, listener, callback) {
    var characteristic = this._characteristics[uuid];

    characteristic.notify(notify, function (state) {
        if (notify) {
            characteristic.addListener('read', listener);
        } else {
            characteristic.removeListener('read', listener);
        }

        callback();
    });
};

BLE.prototype.notifyAccelerometer = function (callback) {
    this.notifyCharacteristic(ACCELEROMETER_DATA_UUID, true, this.onAccelerometerChange.bind(this), callback);
};

BLE.prototype.unnotifyAccelerometer = function (callback) {
    this.notifyCharacteristic(ACCELEROMETER_DATA_UUID, false, this.onAccelerometerChange.bind(this), callback);
};

BLE.prototype.notifyIrTemperature = function(callback) {
	this.notifyCharacteristic(IR_TEMPERATURE_DATA_UUID, true, this.onIrTemperatureChange.bind(this), callback);
};

BLE.prototype.unnotifyIrTemperature = function(callback) {
	this.notifyCharacteristic(IR_TEMPERATURE_DATA_UUID, false, this.onIrTemperatureChange.bind(this), callback);
};

BLE.prototype.notifyHumidity = function(callback) {
	this.notifyCharacteristic(HUMIDITY_DATA_UUID, true, this.onHumidityChange.bind(this), callback);
};

BLE.prototype.unnotifyHumidity = function(callback) {
	this.notifyCharacteristic(HUMIDITY_DATA_UUID, false, this.onHumidityChange.bind(this), callback);
};

module.exports = BLE;
