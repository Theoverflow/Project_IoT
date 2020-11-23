var IR_TEMPERATURE_CONFIG_UUID = 'f000aa0204514000b000000000000000';
var IR_TEMPERATURE_DATA_UUID = 'f000aa0104514000b000000000000000';

var BLE = require("./lib/ble.js");

console.log("discovering...");

BLE.discover(function (device) {
    var device_name = device._peripheral.advertisement.localName;
    console.log("found BLE device: " + device._peripheral.uuid + " (" + device_name + ")");

    device.connect(function () {
        console.log("Connected to BLE device: " + device._peripheral.uuid);
        
        // Create disconnection listener
        device.on('disconnect', function () {
            console.log("disconnected");
        });
        
        // Enable accelerometer sensor
        device.writeHandle(0x34, new Buffer([0x01, 'A', 'B']), false, function (error) {
            if (error != undefined) {
                console.log("write handle error: " + error);
            } else {
                // Read accelerometer data
                device.readHandle(0x30, function (error, data) {
                    if (error != undefined) {
                        console.log("write handle error: " + error);
                    } else {
                        // Read accelerometer data
                        console.log("data: " + data);                       
                    }
                });
            }
        });
        
        // // discover services and characteristics.
        // console.log("discovering services and characteristics...");
        // device.discoverServicesAndCharacteristics(function () {
        //     console.log("done");
        // });
    });
});

function sleep(milliseconds) {
    var start = new Date().getTime();
    for (var i = 0; i < 1e7; i++) {
        if ((new Date().getTime() - start) > milliseconds) {
            break;
        }
    }
}

