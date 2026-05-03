// Future liveData/NMEA boundary.
//
// This module is intentionally a no-op. It provides one stable
// place for later instrument/NMEA adapters to publish transient live values
// without changing the existing manual log-entry data model.

const liveData = {
  getSnapshot(){
    return {};
  },

  subscribe(){
    return () => {};
  }
};

window.STEELER = window.STEELER || {};
window.STEELER.liveData = liveData;
