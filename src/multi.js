import React from 'react'

export default function makeMultiOrganism(
  Parent,
  cells,
  {
    onChange,
    adjustArgs
  } = {}
) {
  return class OrganismMulticelled extends React.Component {
    state = Object.keys(cells).reduce((state, cellKey) => {
      state[cellKey] = cells[cellKey].initial(this.props)
      return state
    }, {})

    changeStateForCell(stateChanger, cellKey) {
      // Can either be a plain object or a callback to transform the existing state
      this.setState(
        (prevState, props) => {
          let changes = {}
          // Check if stateChanger is a function
          if (typeof(stateChanger) === typeof(stateChanger.call)) { // TODO: better function check?
            changes[cellKey] = stateChanger(prevState[cellKey], props)
          }
          // Else just an object with changes
          else {
            changes[cellKey] = stateChanger
          }
          return changes
        },
        // Call onChange once updated with current version of state
        onChange ? () => { onChange(this.state) } : undefined
      )
    }

    // Uses `load` handler, if present, to asynchronously load initial state
    loadAsync(nextProps, prevProps) {
      Object.keys(cells).map(cellKey => {
        const handlersIn = cells[cellKey]
        if (handlersIn.load) {
          // Wrap in Promise to safely catch any errors thrown by `load`
          Promise.resolve(true).then(() => handlersIn.load(nextProps, prevProps, { handlers: this.cellsProxy[cellKey].handlers }))
            .then(updater => updater && this.changeStateForCell(updater, cellKey))
            .catch(error => this.setState({ loadError: error }))
        }
      })
    }

    componentDidMount() {
      this.loadAsync(this.props, null)
    }

    componentWillReceiveProps(nextProps) {
      this.loadAsync(nextProps, this.props)
    }

    cellsProxy = Object.keys(cells).reduce((cellsProxy, cellKey) => {
      const handlersIn = cells[cellKey]
      const handlers = Object.keys(handlersIn).reduce((out, key) => {
        // Special case for `load` handler to reload fresh
        if (key === 'load') {
          out.load = () => {
            // FIXME
            this.loadAsync(this.props, null)
          }
          return out
        }

        out[key] = (...args) => {
          if (adjustArgs) {
            args = adjustArgs(args)
          }

          // Call handler function, props first, then rest of args
          // Note: that this should only be given its own handlers, as that’s all it knows about
          const stateChanger = handlersIn[key].apply(null, [ Object.assign({}, this.props, { handlers }) ].concat(args));
          // Can return multiple state changers, ensure array, and then loop through
          [].concat(result).forEach(stateChanger => {
            // Check if thenable (i.e. a Promise)
            if (!!stateChanger && (typeof stateChanger.then === typeof Object.assign)) {
              stateChanger
                .then(stateChanger => {
                  stateChanger && this.changeStateForCell(stateChanger, cellKey)
                })
                .catch(error => {
                  this.setState({ handlerError: error })
                })
            }
            // Otherwise, change state immediately
            // Required for things like <textarea> onChange to keep cursor in correct position
            else {
              stateChanger && this.changeStateForCell(stateChanger, cellKey)
            }
          })
        }
        return out
      }, {})

      Object.defineProperty(cellsProxy, cellKey, {
        get: () => {
          // Track which cells are used
          //this.usedCells[cellKey] = true
          return Object.assign({}, this.state[cellKey], { handlers })
        }
      })
      return cellsProxy
    }, {})

    render() {
      // Render the pure component, passing both props and cells
      return <Parent { ...this.props } cells={ this.cellsProxy } />
    }
  }
}
