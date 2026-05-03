// Static reference/config data used offline. No DOM or storage access.

window.STEELER = window.STEELER || {};

const OFFLINE_PORTS = Object.freeze({
  "lymington": {lat:50.758, lon:-1.540},
  "cowes": {lat:50.763, lon:-1.297},
  "yarmouth": {lat:50.705, lon:-1.498},
  "portsmouth": {lat:50.802, lon:-1.109},
  "gosport": {lat:50.795, lon:-1.125},
  "port solent": {lat:50.845, lon:-1.138},
  "poole": {lat:50.714, lon:-1.985},
  "weymouth": {lat:50.613, lon:-2.455},
  "dartmouth": {lat:50.351, lon:-3.579},
  "salcombe": {lat:50.237, lon:-3.769},
  "plymouth": {lat:50.366, lon:-4.143},
  "falmouth": {lat:50.155, lon:-5.073},
  "fowey": {lat:50.336, lon:-4.638},
  "padstow": {lat:50.544, lon:-4.936},
  "st vaast": {lat:49.590, lon:-1.267},
  "cherbourg": {lat:49.642, lon:-1.622},
  "st helier": {lat:49.183, lon:-2.105},
  "st malo": {lat:48.649, lon:-2.025},
  "le havre": {lat:49.494, lon:0.107},
  "honfleur": {lat:49.419, lon:0.232},
  "dieppe": {lat:49.925, lon:1.078},
  "fecamp": {lat:49.757, lon:0.374},
  "granville": {lat:48.839, lon:-1.596},
  "roscoff": {lat:48.724, lon:-3.984},
  "brest": {lat:48.390, lon:-4.487},
  "concarneau": {lat:47.875, lon:-3.917},
  "lorient": {lat:47.748, lon:-3.366},
  "les sables d'olonne": {lat:46.496, lon:-1.794},
  "la rochelle": {lat:46.155, lon:-1.151},
  "la rochelle-pallice": {lat:46.159, lon:-1.223},
  "dunkerque": {lat:51.049, lon:2.377},
  "calais": {lat:50.958, lon:1.851},
  "deauville": {lat:49.363, lon:0.078},
  "brighton": {lat:50.820, lon:-0.142},
  "newhaven": {lat:50.793, lon:0.055},
  "eastbourne": {lat:50.770, lon:0.293},
  "chichester": {lat:50.814, lon:-0.876},
  "langstone": {lat:50.824, lon:-1.012}
});

window.STEELER.staticConfig = {
  OFFLINE_PORTS
};
