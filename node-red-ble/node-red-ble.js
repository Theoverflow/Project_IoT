
// Module BLE values
var TEMPERATURE_DATA_UUID    = '05366e80cf3a11e19ab40002a5d5c51b';
var ACCELEROMETER_DATA_UUID  = '03366e80cf3a11e19ab40002a5d5c51b';
var HUMIDITY_DATA_UUID       = '07366e80cf3a11e19ab40002a5d5c51b';
var LED_DATA_UUID            = '0c366e80cf3a11e19ab40002a5d5c51b';
var LED_DATA_READ            = '0c366e80cf3a11e19ab40002a5d5c51b'; // TODO Put the right characteristic
var LED_ON  = "1";
var LED_OFF = "0";

var READ_INTERVAL = 1000;

// Sensor tag values
/*var IR_TEMPERATURE_CONFIG_UUID = 'f000aa0204514000b000000000000000';
var IR_TEMPERATURE_DATA_UUID = 'f000aa0104514000b000000000000000';

var ACCELEROMETER_CONFIG_UUID = 'f000aa1204514000b000000000000000';
var ACCELEROMETER_DATA_UUID = 'f000aa1104514000b000000000000000';

var HUMIDITY_CONFIG_UUID = 'f000aa2204514000b000000000000000';
var HUMIDITY_DATA_UUID = 'f000aa2104514000b000000000000000';*/

module.exports = function (RED) {
    "use strict";
    var BLE = require("./lib/ble.js");
	var util = require('util');

    function BLENode(n) {
        RED.nodes.createNode(this, n);

        this.showDebug = true;

        this.uuid = n.uuid;
		this.config = n;
        this.topic = n.topic;
        if (this.uuid === "") { this.uuid = undefined; }

		this.intervalObject = [];

        /**
		 * Define the status of the sensor 
		 * Possible values are : 'init', 'scan', 'connecting', 'connected', 'disconnecting', 'disconnected', 'error', 'fixing'
		 */
		this.stat = null;

		// Data sent by user
		this.on('input',this.onInput.bind(this));
        
        this.updateStatus('init','red');
        this.scan();
    }

    RED.nodes.registerType("BLE", BLENode);

    /**
	 * Emit by node-red when the node isn't present
	 * anymore in the flow.
	 * Call disconnect and doesn't want an other scan. 
	 */
	BLENode.prototype.close = function(){
		this.log("Node Closed");
		if(typeof this.device !== "undefined"){
			if(this.device)
				this.device.disconnect();
		}
	}

    /**
     * Input of the node
     */ 
	BLENode.prototype.onInput = function(msg){
   		if(this.device != undefined && this.device != null  && this.stat == "connected"){
       		if(msg.led !== undefined && msg.led === LED_ON){			
                this.device.writeCharacteristic(LED_DATA_UUID,new Buffer([0x1]));
				this.sendLedState();
		    }else if(msg.led !== undefined && msg.led === LED_OFF){
                this.device.writeCharacteristic(LED_DATA_UUID,new Buffer([0x0]));
				this.sendLedState();
            }else if(msg.getState){
				this.sendLedState();
            }
        }else
            this.send("Wrong data format or device not connected");
	};

	BLENode.prototype.sendLedState = function(){
		if(this.device != undefined && this.device != null && this.stat == "connected"){
			this.device.readDataCharacteristic(LED_DATA_READ, function(data){
				var msg = {
					led : data.readUInt8(0)
				};
				if(this.stat == "connected")
		            this.send(msg);
			}.bind(this));
		}
	}

	BLENode.prototype.scan = function(){
        if(this.device != undefined || this.device != null){
			this.log("Deleted old object")
            this.device.removeAllListeners();
			delete this.device;
			this.device = undefined;

            this.removeAllListeners();
		}

		if(this.stat === 'init' || this.stat === 'disconnected' || this.stat === 'error'){
			this.updateStatus('scan', 'yellow')
			this.log("Launch Discovering on uuid : " + this.uuid);
			BLE.discover(this.onDiscover.bind(this), this.uuid);
		}
    }

	BLENode.prototype.onDiscover = function(device){
		this.device = device;
        this.uuid = device._peripheral.uuid;
        var device_name = device._peripheral.advertisement.localName;
        this.log("found BLE device: " + device._peripheral.uuid + " (" + device_name + ")");

        device.connect(this.onConnect.bind(this));
	}

	BLENode.prototype.onConnect = function(){
        this.updateStatus('connecting', 'yellow');
        
        // Create disconnection listener
        this.device.on('disconnect', this.onDisconnect.bind(this));
        
        // discover services and characteristics.
        this.log("discovering services and characteristics...");
        this.device.discoverServicesAndCharacteristics(this.onDiscoverServicesAndCharacteristics.bind(this));
	}

	BLENode.prototype.onDisconnect = function(){
        this.log("disconnected");
        this.updateStatus('disconnected', 'red');

		for(var interval in this.intervalObject)
			clearInterval(interval);
		
	
        if(this.device != undefined || this.device != null){
            this.device.removeAllListeners();
            delete this.device;
            this.device = null;
        }
        //this.removeAllListeners();

        //this.scan();
	}

	BLENode.prototype.onDiscoverServicesAndCharacteristics = function(){
		var n = this.config;
		this.log("done");

        var node = this;

		if(n.accelerometer !== undefined && n.accelerometer){
			this.log("Enabling Accelerometer sensor...");            
            var lambda = function(){
                if(this.device && this.stat == "connected"){
                    this.device.readDataCharacteristic(ACCELEROMETER_DATA_UUID, function(data){
                        var msg = { 'topic': node.topic + '/accelerometre' };
    		            msg.payload = {
                            "x" : data.readInt16LE(0), 
                            "y" : data.readInt16LE(2),
                            "z" : data.readInt16LE(4)
                        };
						if(this.stat == "connected")
							node.send(msg);
                    }.bind(this));
                }
           };
			
			this.intervalObject.push(setInterval(lambda.bind(this), READ_INTERVAL));
			//this.device.writeCharacteristic(ACCELEROMETER_CONFIG_UUID, new Buffer([0x01]), this.enableAcc.bind(this));
		}

		if(n.humidity !== undefined && n.humidity){
			this.log("Enabling Humidity sensor...");      
            var lambda = function(){
                if(this.device && this.stat == "connected"){
                    this.device.readDataCharacteristic(HUMIDITY_DATA_UUID, function(data){
                        var msg = { 'topic': node.topic + '/humidity' };
		                msg.payload = {
                            "humidity" : parseInt(data.readUInt16LE(0),10) / 10
                        };
						if(this.stat == "connected")
							node.send(msg);
                    }.bind(this));
                }
           };

            this.intervalObject.push(setInterval(lambda.bind(this), READ_INTERVAL));
			//this.device.writeCharacteristic(HUMIDITY_CONFIG_UUID, new Buffer([0x01]), this.enableHum.bind(this));
		}

		if(n.temperature !== undefined && n.temperature){
			this.log("Enabling Temperature sensor...");          
            var lambda = function(){
                if(this.device && this.stat == "connected"){
                    this.device.readDataCharacteristic(TEMPERATURE_DATA_UUID, function(data){
                        var msg = { 'topic': node.topic + '/temperature' };
		                msg.payload = {
                            "temperature" : parseInt(data.readInt16LE(0),10) / 10
                        };
						if(this.stat == "connected")
							node.send(msg);
                    }.bind(this));
                }
           };

			this.intervalObject.push(setInterval(lambda.bind(this), READ_INTERVAL));
			//this.device.writeCharacteristic(IR_TEMPERATURE_CONFIG_UUID, new Buffer([0x01]), this.enableTemp.bind(this));				
		}

        this.updateStatus('connected', 'green');
	}

    /****************************
     ** Service handling (with notification)
     ***************************/

	BLENode.prototype.enableTemp = function(){
		this.log("Done Temperature");
		// Temperature
		this.log("Reading Temperature data (one time read)");
		var devLocal = this.device;
		var node = this;
		this.device.readDataCharacteristic(IR_TEMPERATURE_DATA_UUID, function (data) {
		    devLocal.convertIrTemperatureData(data, function (objTemp, ambTemp) {
		        var msg = { 'topic': node.topic + '/temperature' };
		        msg.payload = {"ir" : objTemp.toFixed(1), "ambient" : ambTemp.toFixed(1)};
		        node.log("temperature="+JSON.stringify(msg.payload));
		        node.send(msg);
		    });
		});
		
		// Enable temperature notifications
		this.device.notifyIrTemperature(function () { });

		this.device.on('irTemperatureChange', function (objTemp, ambTemp) {
		        var msg = { 'topic': node.topic + '/temperature' };
		        msg.payload = {"ir" : objTemp.toFixed(1), "ambient" : ambTemp.toFixed(1)};
		        node.send(msg);
		    });
	}

	BLENode.prototype.enableAcc = function(){	
		this.log("Done Accelerometer");
	
		// Accelerometer
		this.log("Reading Accelerometer data (one time read)");
		var devLocal = this.device;
		var node = this;
		this.device.readDataCharacteristic(ACCELEROMETER_DATA_UUID, function (data) {
		    devLocal.convertAccelerometerData(data, function (x, y, z) {
		        node.log("x=" + x + ", y=" + y + ", z=" + z);

		        var msg = { 'topic': node.topic + '/accelerometer' };
		        msg.payload = { 'x': +x.toFixed(2), 'y': +y.toFixed(2), 'z': +z.toFixed(2) };
		        node.send(msg);
		    });
		});
		
		// Enable accelerometer notifications
		this.device.notifyAccelerometer(function () { });

		this.device.on('accelerometerChange', function (x, y, z) {
		    var msg = { 'topic': node.topic + '/accelerometer' };
		    msg.payload = { 'x': +x.toFixed(2), 'y': +y.toFixed(2), 'z': +z.toFixed(2) };
		    node.send(msg);
		});
	}

	BLENode.prototype.enableHum = function(){	
		this.log("Done Humidity");
		// Humidity
		var devLocal = this.device;
		var node = this;
		this.log("Reading Humidity data (one time read)");
		this.device.readDataCharacteristic(HUMIDITY_DATA_UUID, function (data) {
		    devLocal.convertHumidityData(data, function (temp, hum) {
		        node.log("humidity=" + hum);

		        var msg = { 'topic': node.topic + '/humidity' };
		        msg.payload = {"humidity" : hum.toFixed(1), "temperature" : temp.toFixed(1)};
		        node.send(msg);
		    });
		});
		
		// Enable humidity notifications
		this.device.notifyHumidity(function () { });

		this.device.on('humidityChange', function (temp, hum) {
		    var msg = { 'topic': node.topic + '/humidity' };
	        msg.payload = {"humidity" : hum.toFixed(1), "temperature" : temp.toFixed(1)};
		    node.send(msg);
		});
	}


    /****************************
     ** Util fun
     ***************************/

    /**
	 * Update the status of the node
	 * @param s The node status
	 * @param c The color of this status
	 */
	BLENode.prototype.updateStatus = function(s,c){
		var oldState = this.stat;
		this.stat = s;
		this.status({fill: c, shape: "dot", text:this.stat});
		this.sendState();
	}

    BLENode.prototype.sendState = function (){
		this.send({
			"uuid" : this.uuid,
			"state" : this.stat
		});
	}

    /**
	 * Send data in adding the current state and the uuid
	 * @param msg The msg to send 
	 */
	BLENode.prototype.sendData = function(msg){
		msg.uuid = this.uuid;
		msg.state = this.stat;
		this.send(msg);
	}
	
	/**
	 * Log properly the msg given in argument
	 */
	BLENode.prototype.log = function(msg){
		if(this.showDebug)
			util.log("[BLE]["+this.id+"]["+this.stat+"]"+" : "+ msg)
	}

}
