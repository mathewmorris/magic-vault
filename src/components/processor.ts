const processor = {
    timerCallback: function() {
      if (this.video.paused || this.video.ended) {
        return;
      }
      this.computeFrame();
      let self = this;
      setTimeout(function () {
          self.timerCallback();
        }, 0);
    },
  
    doLoad: function() {
      this.video = document.getElementById("video");
      this.c1 = document.getElementById("canvas");
      this.ctx1 = this.c1.getContext("2d");
      let self = this;
      this.video.addEventListener("play", function() {
          self.width = 640;
          self.height = 480;
          self.timerCallback();
        }, false);
    },
  
    computeFrame: function() {
      this.ctx1.drawImage(this.video, 0, 0, this.width, this.height);
      return;
    }
  };

export default processor;

