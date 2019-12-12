import React from 'react'
import _ from 'lodash'
import {observer} from 'mobx-react'

const Text = props => {
  // console.log("rendering: " + props.compId);
  return <div>{props.data.text}</div>
}
const Button = props => {
  // console.log("rendering: " + props.compId);
  return <button onClick={props.onClick || _.noop} style={{width: props.layout.width, height:props.layout.height}}>{props.data.label}</button>
}
const Image = props => <img style={{width: props.layout.width, height:props.layout.height}} src={props.data.src}/>

const viewerComponents = {
  Text,
  Button,
  Image
}
//
// const viewerComponents = {
//   Text: observer(Text),
//   Button: observer(Button),
//   Image: observer(Image)
// }

window.updateComp = {}
function Wrapper({Comp, props, compId}) {
  const [, updateState] = React.useState();
  const forceUpdate = React.useCallback(() => updateState({}), []);
  window.updateComp[compId] = forceUpdate
  return <Comp {...props} />
}

export default ({components}) => {
  React.useEffect(() => {
    performance.mark('render-end')
    performance.measure('render', 'render-start', 'render-end')
    performance.measure('platform', 'platform-start', 'platform-end')
    console.log('platform', performance.getEntriesByName('platform')[0].duration);
    console.log('render', performance.getEntriesByName('render')[0].duration);
  }, [])

  React.useEffect(() => {
    performance.mark('re-render-end')
    performance.measure('re-render', 're-render-start', 're-render-end')
    console.log('re-render', performance.getEntriesByName('render')[0].duration);
  })


  return (<div>
    {
      components.map(comp => {
        const Comp = viewerComponents[comp.type];
        if (!Comp) return <div key={comp.compId}/>
        return (<div key={comp.compId}
                     style={{position: "absolute",
                       top: comp.layout.y,
                       left: comp.layout.x}}>
          <Wrapper Comp={Comp} compId={comp.compId} props={comp} />
          {/*<Comp {...comp}/>*/}
        </div>)
      })
    }
  </div>)
}
