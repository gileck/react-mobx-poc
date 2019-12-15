import React from 'react'
import _ from 'lodash'
import {observer} from 'mobx-react'

function useForceUpdate() {
  const [, setTick] = React.useState(0)
  const update = React.useCallback(() => {
    setTick(tick => tick + 1)
  }, [])
  return update
}

const Text = props => {
  // console.log("rendering: " + props.compId);

  return <div id={props.compId}>{props.data.text}</div>
}
const Button = props => {
  // console.log("rendering: " + props.compId);
  return <button id={props.compId} onClick={props.onClick || _.noop} style={{width: props.layout.width, height: props.layout.height}}>{props.data.label}</button>
}
const Image = props => <img style={{width: props.layout.width, height: props.layout.height}} src={props.data.src}/>

let viewerComponents

window.isMobx = location.search.includes("mobx")
window.isNaive = location.search === ""
window.isUpdateProps = location.search.includes("updateProps")

if (window.isMobx) {
  viewerComponents = {
    Text: observer(Text),
    Button: observer(Button),
    Image: observer(Image)
  }
} else {
  viewerComponents = {
    Text,
    Button,
    Image
  }
}
// window.viewerComponents =
//

window.updateProps = {}
function Wrapper({Comp, props, compId}) {
  window.updateProps[compId] = useForceUpdate()
  return <Comp {...props} />
}

export const ViewerComponents = viewerComponents

export default ({components}) => {
  React.useEffect(() => {
    performance.mark('render-end')
    performance.measure('render', 'render-start', 'render-end')
    console.log('render', performance.getEntriesByName('render')[0].duration);
    // performance.measure('platform', 'platform-start', 'platform-end')
    // console.log('platform', performance.getEntriesByName('platform')[0].duration);
  }, [])

  // React.useEffect(() => {
  //   performance.mark('re-render-end')
  //   performance.measure('re-render', 're-render-start', 're-render-end')
  //   console.log('re-render', performance.getEntriesByName('render')[0].duration);
  // })

  if (window.carmi) {
    return <div>{components}</div>
  }

  return (<div>
    {
      components.map(comp => {
        const Comp = viewerComponents[comp.type];
        if (!Comp) return <div key={comp.compId}/>
        return (<div key={comp.compId}
                     style={{
                       position: "absolute",
                       top: comp.layout.y,
                       left: comp.layout.x
                     }}>
          {/*{ window.isUpdateProps ? <Wrapper Comp={Comp} compId={comp.compId} props={comp}/> : <Comp {...comp}/> }*/}
          <Wrapper Comp={Comp} compId={comp.compId} props={Object.assign(comp, globals)}/>
        </div>)
      })
    }
  </div>)
}
