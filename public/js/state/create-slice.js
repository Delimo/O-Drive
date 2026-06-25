export function createSlice({ name, initialState: sliceState, reducers }) {
  const actionCreators = {};
  const caseMap = {};

  Object.entries(reducers).forEach(([key, reducer]) => {
    const type = `${name}/${key}`;
    caseMap[type] = reducer;
    actionCreators[key] = (payload) => ({ type, payload });
  });

  const reducer = (state = sliceState, action) => {
    const current = caseMap[action.type];
    return current ? current(state, action) : state;
  };

  return { actions: actionCreators, reducer };
}

export function combineReducers(reducers) {
  return (state, action) => {
    const next = {};
    for (const [key, reducer] of Object.entries(reducers)) {
      next[key] = reducer(state[key], action);
    }
    return next;
  };
}

export function createStore(reducer, state) {
  let currentState = state;
  const listeners = new Set();
  let batchDepth = 0;

  function notifyListeners() {
    if (batchDepth > 0) return;
    listeners.forEach((listener) => listener());
  }

  const store = {
    getState() {
      return currentState;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch(action) {
      if (typeof action === "function") {
        return action(store.dispatch.bind(store), store.getState.bind(store));
      }
      currentState = reducer(currentState, action);
      notifyListeners();
      return action;
    },
    async batchDispatch(actions) {
      batchDepth++;
      try {
        for (const action of actions) {
          await store.dispatch(action);
        }
      } finally {
        batchDepth--;
        notifyListeners();
      }
    },
  };
  return store;
}
