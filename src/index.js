window.isMobx = location.search.includes("mobx")
window.isNaive = location.search === ""
window.isUpdateProps = location.search.includes("updateProps")

import ReactDOM from 'react-dom'
import React from 'react'
import Renderer from './Renderer'
import createStructrue from "./createStructrue";
import {observable, toJS} from 'mobx'

let components
let isRendered = false

window.updateProps = {}
const renderAllComponents = () => ReactDOM.render(<Renderer components={components}/>, document.getElementById('root'))
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
    components = observable(components)
    performance.mark('observable-end')
    performance.measure('observable', 'observable-start', 'observable-end')
  }



  window.components = components

  performance.mark('render-start')
  renderAllComponents()
  isRendered = true
}

startViewer()
