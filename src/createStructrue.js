import _ from 'lodash'
const MAX_X = 50000
const MAX_Y = 50000
function random(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// const random = (min, max) => Math.random() * (max - min) + min;
const createButton = (index) => ({
  "compId": "compId" + index,
  "type": "Button",
  "wixCodeId": "#button" + index,
  "data": {
    "label": "Button: " + index
  },
  "layout": {
    "x": random(0, MAX_X),
    "y": random(0, MAX_Y),
    "width": 142,
    "height": 40
  }
})
const createImage = (index) => ({
  "compId": "compId" + index,
  "type": "Image",
  "wixCodeId": "#image" + index ,
  "data": {
    "src": "https://picsum.photos/id/"+random(1, 300)+"/200"
  },
  "layout": {
    "x": random(0, MAX_X),
    "y": random(0, MAX_Y),
    "width": 200,
    "height": 200
  }
})
const createText = (index) => ({
  "compId": "compId" + index,
  "type": "Text",
  "wixCodeId": "#text" + index,
  "data": {
    "text": "Text: " + index
  },
  "layout": {
    "x": random(0, MAX_X),
    "y": random(0, MAX_Y),
    "width": 100,
    "height": 100
  }
})
// const factories = [createButton, createImage, createText]
const factories = [createButton, createText]

export default function createStructure(numOfComps) {

  return _.range(numOfComps).map(index => {
    return factories[index % factories.length](index)
  })

}
