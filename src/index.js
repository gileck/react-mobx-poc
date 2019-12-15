window.isMobx = location.search.includes("mobx")
window.isNaive = location.search === ""
window.isUpdateProps = location.search.includes("updateProps")
window.carmi = location.search.includes("carmi")

import ReactDOM from 'react-dom'
import React from 'react'
import Renderer,{ViewerComponents} from './Renderer'
import createStructrue from "./createStructrue";
import factory from './model'
import {observable, toJS} from 'mobx'
import {Provider, carmiReactFnLib} from 'carmi-react'

let components
let isRendered = false
let carmiInstance

window.updateProps = {}
// const renderAllComponents = () =>
function platform() {
  return new Promise(async resolve => {
    const wixCode = await fetch('/wixCode').then(res => res.text())
    const worker = new Worker('/worker.js')
    worker.postMessage({
      wixCode,
      components: toJS(components),
      type: "START"
    })
    const handlers = {
      SET_DATA: function ({compId, data}) {
        const component = components.find(comp => compId === comp.compId)
        Object.assign(component.data, data)
        // if (isRendered && window.isNaive) renderAllComponents()
        // if (window.isUpdateProps && window.updateProps[compId]) window.updateProps[compId]()
      },
      SET_EVENT_HANDLER: function ({compId, callbackId}) {
        const component = components.find(comp => compId === comp.compId)
        component.onClick = function () {
          worker.postMessage({
            type: "HANDLE_EVENT",
            callbackId
          })
        }
      },
      WORKER_DONE: () => resolve(),
    }
    worker.onmessage = ({data}) => handlers[data.type](data)
  })
}

async function startViewer() {
  // components = await fetch('/siteStructure').then(res => res.json())
  components = await createStructrue(10000)
  performance.mark('platform-start')
  await platform()
  performance.mark('platform-end')
  performance.measure('platform', 'platform-start', 'platform-end')

  // console.log({components})
  if (window.isMobx) {
    performance.mark('observable-start')
    components = components
    globals = observable({
      isLoggedIn: false
    })
    performance.mark('observable-end')
    performance.measure('observable', 'observable-start', 'observable-end')
  }

  if (window.carmi) {
    carmiInstance = factory(components, carmiReactFnLib);
    window.carmiInstance = carmiInstance
  }



  window.components = components

  performance.mark('render-start')
  if (carmi) {
    ReactDOM.render(React.createElement(Provider, {
      value: carmiInstance,
      compsLib: {Renderer,...ViewerComponents },
    }, () => carmiInstance.renderer), document.getElementById('root'))
  } else {
    ReactDOM.render(<Renderer globals={globals} components={components}/>, document.getElementById('root'))
  }
  // renderAllComponents()
  isRendered = true
}

startViewer()
