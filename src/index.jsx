/**
 * https://developers.google.com/doubleclick-gpt/reference
*/
import React, { Component } from 'react';
import { findDOMNode } from 'react-dom';
import keymirror from 'keymirror';

export const Format = keymirror({
  HORIZONTAL: null,
  RECTANGLE: null,
  VERTICAL: null,
  MOBILE: null,
});

export const Dimensions = {
  [Format.HORIZONTAL]: [[970, 90], [728, 90], [468, 60], [234, 60]],
  [Format.RECTANGLE]: [[336, 280], [300, 250], [250, 250], [200, 200], [180, 150], [125, 125]],
  [Format.VERTICAL]: [[300, 600], [160, 600], [120, 600], [120, 240]],
  [Format.MOBILE]: [[320, 50]],
  '300x600': [[300, 600], [160, 600]],
  '336x280': [[336, 280], [300, 250]],
  '728x90': [[728, 90], [468, 60]],
  '970x90': [[970, 90], [728, 90], [468, 60]],
};

function prepareDimensions(dimensions, format = Format.HORIZONTAL, canBeLower = true) {
  if (!dimensions || !dimensions.length) {
    return Dimensions[format] || [];
  }

  if (dimensions.length === 1 && canBeLower) {
    const dimension = dimensions[0];
    const key = `${dimension[0]}x${dimension[1]}`;

    if (Dimensions[key]) {
      return Dimensions[key] || [];
    }
  }

  return dimensions;
}

let nextID = 1;
let googletag = null;

function getNextID() {
  return 'rgpt-' + (nextID++);
}

function initGooglePublisherTag() {
  if (googletag) {
    return;
  }

  googletag = window.googletag = window.googletag || {};
  googletag.cmd = googletag.cmd || [];

  googletag.cmd.push(function prepareGoogleTag() {
    // add support for async loading
    googletag.pubads().enableAsyncRendering();

    // collapse div without ad
    googletag.pubads().collapseEmptyDivs();

    // load ad with slot refresh
    googletag.pubads().disableInitialLoad();

    // enable google publisher tag
    googletag.enableServices();

    // check to see if iFrame, then if so, set url to parent
    if(window.frameElement){
      googletag.pubads().set('page_url', window.parent.location.href);
    }
  });

  (function loadScript() {
    const gads = document.createElement('script');
    gads.async = true;
    gads.type = 'text/javascript';
    gads.src = '//www.googletagservices.com/tag/js/gpt.js';

    const head = document.getElementsByTagName('head')[0];
    head.appendChild(gads);
  })();
}

export default class GooglePublisherTag extends Component {
  static propTypes = {
    className: React.PropTypes.string,
    path: React.PropTypes.string.isRequired,
    format: React.PropTypes.string.isRequired,
    responsive: React.PropTypes.bool.isRequired,
    canBeLower: React.PropTypes.bool.isRequired, // can be ad lower than original size,

    sizeMap: React.PropTypes.array,
    dimensions: React.PropTypes.array,  // [[300, 600], [160, 600]]
    targeting: React.PropTypes.object, // {key: value}

    minWindowWidth: React.PropTypes.number.isRequired,
    maxWindowWidth: React.PropTypes.number.isRequired,
    allowRefresh: React.PropTypes.bool,
  };

  static defaultProps = {
    format: Format.HORIZONTAL,
    responsive: true,
    canBeLower: true,
    dimensions: null,
    minWindowWidth: -1,
    maxWindowWidth: -1,
  };

  componentDidMount() {
    initGooglePublisherTag();

    if (this.props.responsive) {
      window.addEventListener('resize', this.handleResize);
    }

    googletag.cmd.push(() => {
      this.initialized = true;

      this.update(this.props);
    });

    if (this.props.allowRefresh) {
      window.addEventListener('refreshAds', this.refreshSlot);
    }
  }

  componentWillReceiveProps(props) {
    this.update(props);
  }

  componentWillUnmount() {
    // TODO sometimes can props changed
    if (this.props.responsive) {
      window.removeEventListener('resize', this.handleResize);
    }

    if(this.props.allowRefresh) {
      window.removeEventListener('refreshAds', this.refreshSlot);
    }

    this.removeSlot();
  }

  update(props) {
    if (!this.initialized) {
      return;
    }

    const node = findDOMNode(this);
    if (!node) {
      return;
    }

    const componentWidth = node.offsetWidth;
    const availableDimensions = prepareDimensions(props.dimensions, props.format, props.canBeLower);

    // filter by available node space
    let dimensions = props.responsive
      ? availableDimensions.filter((dimension) => dimension[0] <= componentWidth)
      : availableDimensions;


    // filter by min and max width
    const windowWidth = window.innerWidth;
    const { minWindowWidth, maxWindowWidth, targeting, sizeMap} = props;

    if (minWindowWidth !== -1 && minWindowWidth < windowWidth) {
      dimensions = [];
    } else if (maxWindowWidth !== -1 && maxWindowWidth > windowWidth) {
      dimensions = [];
    }

    // do nothink
    if (JSON.stringify(dimensions) === JSON.stringify(this.currentDimensions)) {
      return;
    }

    this.currentDimensions = dimensions;


    if (this.slot && !sizeMap) {
      // remove current slot because dimensions is changed and current slot is old
      this.removeSlot();
    } else if (this.slot && sizeMap) {
      googletag.pubads().refresh([this.slot]);
    }

    // there is nothink to display
    if (!dimensions || !dimensions.length) {
      return;
    }

    if (!this.refs.holder) {
      console.log('RGPT holder is undefined');
      return;
    }

    if (!this.slot) {
      // prepare new node
      const id = getNextID();
      this.refs.holder.innerHTML = `<div id="${id}"></div>`;

      // prepare new slot
      const slot = this.slot = googletag.defineSlot(props.path, dimensions, id).addService(googletag.pubads());

      if(sizeMap) {
        slot.defineSizeMapping(sizeMap);
      }

      if (targeting) {
        for (const key in targeting) {
          if ({}.hasOwnProperty.call(targeting, key)) {
            slot.setTargeting(key, targeting[key]);
          }
        }
      }

      if (props.targeting) {
        for (const key in props.targeting) {
          if ({}.hasOwnProperty.call(props.targeting, key)) {
            slot.setTargeting(key, props.targeting[key]);
          }
        }
      }

      // display new slot
      googletag.display(id);
      googletag.pubads().refresh([slot]);
    }
  }

  removeSlot() {
    if (!this.slot) {
      return;
    }

    googletag.pubads().clear([this.slot]);
    this.slot = null;

    if (this.refs.holder) {
      this.refs.holder.innerHTML = null;
    }
  }

  refreshSlot() {
    if (this.slot) {
      googletag.pubads().refresh([this.slot]);
    }
  }

  handleResize = () => {
    this.update(this.props);
  };

  render() {
    return (
      <div className={this.props.className} ref="holder" />
    );
  }
}
