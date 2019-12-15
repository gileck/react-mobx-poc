const {root, setter, arg0} = require('carmi');
const {createElement} = require('carmi/jsx')

const comps = root.map(item => createElement(item.get('type'), item.assignIn([{key:item.get('compId')}])));
const renderer = createElement('Renderer', {components: comps},);

module.exports = {
  comps,
  renderer,
  updateComp: setter(arg0)
}
