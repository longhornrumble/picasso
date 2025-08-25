var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __objRest = (source, exclude) => {
  var target = {};
  for (var prop in source)
    if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
      target[prop] = source[prop];
  if (source != null && __getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(source)) {
      if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
        target[prop] = source[prop];
    }
  return target;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var require_iframe_main = __commonJS({
  "iframe-main.js"(exports) {
    var _c;
    function getDefaultExportFromCjs(x) {
      return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
    }
    var jsxRuntime = { exports: {} };
    var reactJsxRuntime_production_min = {};
    var react = { exports: {} };
    var react_production_min = {};
    var hasRequiredReact_production_min;
    function requireReact_production_min() {
      if (hasRequiredReact_production_min) return react_production_min;
      hasRequiredReact_production_min = 1;
      /**
       * @license React
       * react.production.min.js
       *
       * Copyright (c) Facebook, Inc. and its affiliates.
       *
       * This source code is licensed under the MIT license found in the
       * LICENSE file in the root directory of this source tree.
       */
      var l = Symbol.for("react.element"), n = Symbol.for("react.portal"), p = Symbol.for("react.fragment"), q = Symbol.for("react.strict_mode"), r = Symbol.for("react.profiler"), t = Symbol.for("react.provider"), u = Symbol.for("react.context"), v = Symbol.for("react.forward_ref"), w = Symbol.for("react.suspense"), x = Symbol.for("react.memo"), y = Symbol.for("react.lazy"), z = Symbol.iterator;
      function A(a) {
        if (null === a || "object" !== typeof a) return null;
        a = z && a[z] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var B = { isMounted: function() {
        return false;
      }, enqueueForceUpdate: function() {
      }, enqueueReplaceState: function() {
      }, enqueueSetState: function() {
      } }, C = Object.assign, D = {};
      function E(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      E.prototype.isReactComponent = {};
      E.prototype.setState = function(a, b) {
        if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
        this.updater.enqueueSetState(this, a, b, "setState");
      };
      E.prototype.forceUpdate = function(a) {
        this.updater.enqueueForceUpdate(this, a, "forceUpdate");
      };
      function F() {
      }
      F.prototype = E.prototype;
      function G(a, b, e) {
        this.props = a;
        this.context = b;
        this.refs = D;
        this.updater = e || B;
      }
      var H = G.prototype = new F();
      H.constructor = G;
      C(H, E.prototype);
      H.isPureReactComponent = true;
      var I = Array.isArray, J = Object.prototype.hasOwnProperty, K = { current: null }, L = { key: true, ref: true, __self: true, __source: true };
      function M(a, b, e) {
        var d, c = {}, k = null, h = null;
        if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
        var g = arguments.length - 2;
        if (1 === g) c.children = e;
        else if (1 < g) {
          for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
          c.children = f;
        }
        if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
        return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
      }
      function N(a, b) {
        return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
      }
      function O(a) {
        return "object" === typeof a && null !== a && a.$$typeof === l;
      }
      function escape3(a) {
        var b = { "=": "=0", ":": "=2" };
        return "$" + a.replace(/[=:]/g, function(a2) {
          return b[a2];
        });
      }
      var P = /\/+/g;
      function Q(a, b) {
        return "object" === typeof a && null !== a && null != a.key ? escape3("" + a.key) : b.toString(36);
      }
      function R(a, b, e, d, c) {
        var k = typeof a;
        if ("undefined" === k || "boolean" === k) a = null;
        var h = false;
        if (null === a) h = true;
        else switch (k) {
          case "string":
          case "number":
            h = true;
            break;
          case "object":
            switch (a.$$typeof) {
              case l:
              case n:
                h = true;
            }
        }
        if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
          return a2;
        })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
        h = 0;
        d = "" === d ? "." : d + ":";
        if (I(a)) for (var g = 0; g < a.length; g++) {
          k = a[g];
          var f = d + Q(k, g);
          h += R(k, b, e, f, c);
        }
        else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
        else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
        return h;
      }
      function S(a, b, e) {
        if (null == a) return a;
        var d = [], c = 0;
        R(a, d, "", "", function(a2) {
          return b.call(e, a2, c++);
        });
        return d;
      }
      function T(a) {
        if (-1 === a._status) {
          var b = a._result;
          b = b();
          b.then(function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
          }, function(b2) {
            if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
          });
          -1 === a._status && (a._status = 0, a._result = b);
        }
        if (1 === a._status) return a._result.default;
        throw a._result;
      }
      var U = { current: null }, V = { transition: null }, W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
      function X2() {
        throw Error("act(...) is not supported in production builds of React.");
      }
      react_production_min.Children = { map: S, forEach: function(a, b, e) {
        S(a, function() {
          b.apply(this, arguments);
        }, e);
      }, count: function(a) {
        var b = 0;
        S(a, function() {
          b++;
        });
        return b;
      }, toArray: function(a) {
        return S(a, function(a2) {
          return a2;
        }) || [];
      }, only: function(a) {
        if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
        return a;
      } };
      react_production_min.Component = E;
      react_production_min.Fragment = p;
      react_production_min.Profiler = r;
      react_production_min.PureComponent = G;
      react_production_min.StrictMode = q;
      react_production_min.Suspense = w;
      react_production_min.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
      react_production_min.act = X2;
      react_production_min.cloneElement = function(a, b, e) {
        if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
        var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
        if (null != b) {
          void 0 !== b.ref && (k = b.ref, h = K.current);
          void 0 !== b.key && (c = "" + b.key);
          if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
          for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
        }
        var f = arguments.length - 2;
        if (1 === f) d.children = e;
        else if (1 < f) {
          g = Array(f);
          for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
          d.children = g;
        }
        return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
      };
      react_production_min.createContext = function(a) {
        a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
        a.Provider = { $$typeof: t, _context: a };
        return a.Consumer = a;
      };
      react_production_min.createElement = M;
      react_production_min.createFactory = function(a) {
        var b = M.bind(null, a);
        b.type = a;
        return b;
      };
      react_production_min.createRef = function() {
        return { current: null };
      };
      react_production_min.forwardRef = function(a) {
        return { $$typeof: v, render: a };
      };
      react_production_min.isValidElement = O;
      react_production_min.lazy = function(a) {
        return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
      };
      react_production_min.memo = function(a, b) {
        return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
      };
      react_production_min.startTransition = function(a) {
        var b = V.transition;
        V.transition = {};
        try {
          a();
        } finally {
          V.transition = b;
        }
      };
      react_production_min.unstable_act = X2;
      react_production_min.useCallback = function(a, b) {
        return U.current.useCallback(a, b);
      };
      react_production_min.useContext = function(a) {
        return U.current.useContext(a);
      };
      react_production_min.useDebugValue = function() {
      };
      react_production_min.useDeferredValue = function(a) {
        return U.current.useDeferredValue(a);
      };
      react_production_min.useEffect = function(a, b) {
        return U.current.useEffect(a, b);
      };
      react_production_min.useId = function() {
        return U.current.useId();
      };
      react_production_min.useImperativeHandle = function(a, b, e) {
        return U.current.useImperativeHandle(a, b, e);
      };
      react_production_min.useInsertionEffect = function(a, b) {
        return U.current.useInsertionEffect(a, b);
      };
      react_production_min.useLayoutEffect = function(a, b) {
        return U.current.useLayoutEffect(a, b);
      };
      react_production_min.useMemo = function(a, b) {
        return U.current.useMemo(a, b);
      };
      react_production_min.useReducer = function(a, b, e) {
        return U.current.useReducer(a, b, e);
      };
      react_production_min.useRef = function(a) {
        return U.current.useRef(a);
      };
      react_production_min.useState = function(a) {
        return U.current.useState(a);
      };
      react_production_min.useSyncExternalStore = function(a, b, e) {
        return U.current.useSyncExternalStore(a, b, e);
      };
      react_production_min.useTransition = function() {
        return U.current.useTransition();
      };
      react_production_min.version = "18.3.1";
      return react_production_min;
    }
    var hasRequiredReact;
    function requireReact() {
      if (hasRequiredReact) return react.exports;
      hasRequiredReact = 1;
      {
        react.exports = requireReact_production_min();
      }
      return react.exports;
    }
    /**
     * @license React
     * react-jsx-runtime.production.min.js
     *
     * Copyright (c) Facebook, Inc. and its affiliates.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */
    var hasRequiredReactJsxRuntime_production_min;
    function requireReactJsxRuntime_production_min() {
      if (hasRequiredReactJsxRuntime_production_min) return reactJsxRuntime_production_min;
      hasRequiredReactJsxRuntime_production_min = 1;
      var f = requireReact(), k = Symbol.for("react.element"), l = Symbol.for("react.fragment"), m = Object.prototype.hasOwnProperty, n = f.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner, p = { key: true, ref: true, __self: true, __source: true };
      function q(c, a, g) {
        var b, d = {}, e = null, h = null;
        void 0 !== g && (e = "" + g);
        void 0 !== a.key && (e = "" + a.key);
        void 0 !== a.ref && (h = a.ref);
        for (b in a) m.call(a, b) && !p.hasOwnProperty(b) && (d[b] = a[b]);
        if (c && c.defaultProps) for (b in a = c.defaultProps, a) void 0 === d[b] && (d[b] = a[b]);
        return { $$typeof: k, type: c, key: e, ref: h, props: d, _owner: n.current };
      }
      reactJsxRuntime_production_min.Fragment = l;
      reactJsxRuntime_production_min.jsx = q;
      reactJsxRuntime_production_min.jsxs = q;
      return reactJsxRuntime_production_min;
    }
    var hasRequiredJsxRuntime;
    function requireJsxRuntime() {
      if (hasRequiredJsxRuntime) return jsxRuntime.exports;
      hasRequiredJsxRuntime = 1;
      {
        jsxRuntime.exports = requireReactJsxRuntime_production_min();
      }
      return jsxRuntime.exports;
    }
    var jsxRuntimeExports = requireJsxRuntime();
    var reactExports = requireReact();
    const React = /* @__PURE__ */ getDefaultExportFromCjs(reactExports);
    var client = {};
    var reactDom = { exports: {} };
    var reactDom_production_min = {};
    var scheduler = { exports: {} };
    var scheduler_production_min = {};
    /**
     * @license React
     * scheduler.production.min.js
     *
     * Copyright (c) Facebook, Inc. and its affiliates.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */
    var hasRequiredScheduler_production_min;
    function requireScheduler_production_min() {
      if (hasRequiredScheduler_production_min) return scheduler_production_min;
      hasRequiredScheduler_production_min = 1;
      (function(exports2) {
        function f(a, b) {
          var c = a.length;
          a.push(b);
          a: for (; 0 < c; ) {
            var d = c - 1 >>> 1, e = a[d];
            if (0 < g(e, b)) a[d] = b, a[c] = e, c = d;
            else break a;
          }
        }
        function h(a) {
          return 0 === a.length ? null : a[0];
        }
        function k(a) {
          if (0 === a.length) return null;
          var b = a[0], c = a.pop();
          if (c !== b) {
            a[0] = c;
            a: for (var d = 0, e = a.length, w = e >>> 1; d < w; ) {
              var m = 2 * (d + 1) - 1, C = a[m], n = m + 1, x = a[n];
              if (0 > g(C, c)) n < e && 0 > g(x, C) ? (a[d] = x, a[n] = c, d = n) : (a[d] = C, a[m] = c, d = m);
              else if (n < e && 0 > g(x, c)) a[d] = x, a[n] = c, d = n;
              else break a;
            }
          }
          return b;
        }
        function g(a, b) {
          var c = a.sortIndex - b.sortIndex;
          return 0 !== c ? c : a.id - b.id;
        }
        if ("object" === typeof performance && "function" === typeof performance.now) {
          var l = performance;
          exports2.unstable_now = function() {
            return l.now();
          };
        } else {
          var p = Date, q = p.now();
          exports2.unstable_now = function() {
            return p.now() - q;
          };
        }
        var r = [], t = [], u = 1, v = null, y = 3, z = false, A = false, B = false, D = "function" === typeof setTimeout ? setTimeout : null, E = "function" === typeof clearTimeout ? clearTimeout : null, F = "undefined" !== typeof setImmediate ? setImmediate : null;
        "undefined" !== typeof navigator && void 0 !== navigator.scheduling && void 0 !== navigator.scheduling.isInputPending && navigator.scheduling.isInputPending.bind(navigator.scheduling);
        function G(a) {
          for (var b = h(t); null !== b; ) {
            if (null === b.callback) k(t);
            else if (b.startTime <= a) k(t), b.sortIndex = b.expirationTime, f(r, b);
            else break;
            b = h(t);
          }
        }
        function H(a) {
          B = false;
          G(a);
          if (!A) if (null !== h(r)) A = true, I(J);
          else {
            var b = h(t);
            null !== b && K(H, b.startTime - a);
          }
        }
        function J(a, b) {
          A = false;
          B && (B = false, E(L), L = -1);
          z = true;
          var c = y;
          try {
            G(b);
            for (v = h(r); null !== v && (!(v.expirationTime > b) || a && !M()); ) {
              var d = v.callback;
              if ("function" === typeof d) {
                v.callback = null;
                y = v.priorityLevel;
                var e = d(v.expirationTime <= b);
                b = exports2.unstable_now();
                "function" === typeof e ? v.callback = e : v === h(r) && k(r);
                G(b);
              } else k(r);
              v = h(r);
            }
            if (null !== v) var w = true;
            else {
              var m = h(t);
              null !== m && K(H, m.startTime - b);
              w = false;
            }
            return w;
          } finally {
            v = null, y = c, z = false;
          }
        }
        var N = false, O = null, L = -1, P = 5, Q = -1;
        function M() {
          return exports2.unstable_now() - Q < P ? false : true;
        }
        function R() {
          if (null !== O) {
            var a = exports2.unstable_now();
            Q = a;
            var b = true;
            try {
              b = O(true, a);
            } finally {
              b ? S() : (N = false, O = null);
            }
          } else N = false;
        }
        var S;
        if ("function" === typeof F) S = function() {
          F(R);
        };
        else if ("undefined" !== typeof MessageChannel) {
          var T = new MessageChannel(), U = T.port2;
          T.port1.onmessage = R;
          S = function() {
            U.postMessage(null);
          };
        } else S = function() {
          D(R, 0);
        };
        function I(a) {
          O = a;
          N || (N = true, S());
        }
        function K(a, b) {
          L = D(function() {
            a(exports2.unstable_now());
          }, b);
        }
        exports2.unstable_IdlePriority = 5;
        exports2.unstable_ImmediatePriority = 1;
        exports2.unstable_LowPriority = 4;
        exports2.unstable_NormalPriority = 3;
        exports2.unstable_Profiling = null;
        exports2.unstable_UserBlockingPriority = 2;
        exports2.unstable_cancelCallback = function(a) {
          a.callback = null;
        };
        exports2.unstable_continueExecution = function() {
          A || z || (A = true, I(J));
        };
        exports2.unstable_forceFrameRate = function(a) {
          0 > a || 125 < a ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : P = 0 < a ? Math.floor(1e3 / a) : 5;
        };
        exports2.unstable_getCurrentPriorityLevel = function() {
          return y;
        };
        exports2.unstable_getFirstCallbackNode = function() {
          return h(r);
        };
        exports2.unstable_next = function(a) {
          switch (y) {
            case 1:
            case 2:
            case 3:
              var b = 3;
              break;
            default:
              b = y;
          }
          var c = y;
          y = b;
          try {
            return a();
          } finally {
            y = c;
          }
        };
        exports2.unstable_pauseExecution = function() {
        };
        exports2.unstable_requestPaint = function() {
        };
        exports2.unstable_runWithPriority = function(a, b) {
          switch (a) {
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
              break;
            default:
              a = 3;
          }
          var c = y;
          y = a;
          try {
            return b();
          } finally {
            y = c;
          }
        };
        exports2.unstable_scheduleCallback = function(a, b, c) {
          var d = exports2.unstable_now();
          "object" === typeof c && null !== c ? (c = c.delay, c = "number" === typeof c && 0 < c ? d + c : d) : c = d;
          switch (a) {
            case 1:
              var e = -1;
              break;
            case 2:
              e = 250;
              break;
            case 5:
              e = 1073741823;
              break;
            case 4:
              e = 1e4;
              break;
            default:
              e = 5e3;
          }
          e = c + e;
          a = { id: u++, callback: b, priorityLevel: a, startTime: c, expirationTime: e, sortIndex: -1 };
          c > d ? (a.sortIndex = c, f(t, a), null === h(r) && a === h(t) && (B ? (E(L), L = -1) : B = true, K(H, c - d))) : (a.sortIndex = e, f(r, a), A || z || (A = true, I(J)));
          return a;
        };
        exports2.unstable_shouldYield = M;
        exports2.unstable_wrapCallback = function(a) {
          var b = y;
          return function() {
            var c = y;
            y = b;
            try {
              return a.apply(this, arguments);
            } finally {
              y = c;
            }
          };
        };
      })(scheduler_production_min);
      return scheduler_production_min;
    }
    var hasRequiredScheduler;
    function requireScheduler() {
      if (hasRequiredScheduler) return scheduler.exports;
      hasRequiredScheduler = 1;
      {
        scheduler.exports = requireScheduler_production_min();
      }
      return scheduler.exports;
    }
    /**
     * @license React
     * react-dom.production.min.js
     *
     * Copyright (c) Facebook, Inc. and its affiliates.
     *
     * This source code is licensed under the MIT license found in the
     * LICENSE file in the root directory of this source tree.
     */
    var hasRequiredReactDom_production_min;
    function requireReactDom_production_min() {
      if (hasRequiredReactDom_production_min) return reactDom_production_min;
      hasRequiredReactDom_production_min = 1;
      var aa = requireReact(), ca = requireScheduler();
      function p(a) {
        for (var b = "https://reactjs.org/docs/error-decoder.html?invariant=" + a, c = 1; c < arguments.length; c++) b += "&args[]=" + encodeURIComponent(arguments[c]);
        return "Minified React error #" + a + "; visit " + b + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
      }
      var da = /* @__PURE__ */ new Set(), ea = {};
      function fa(a, b) {
        ha(a, b);
        ha(a + "Capture", b);
      }
      function ha(a, b) {
        ea[a] = b;
        for (a = 0; a < b.length; a++) da.add(b[a]);
      }
      var ia = !("undefined" === typeof window || "undefined" === typeof window.document || "undefined" === typeof window.document.createElement), ja = Object.prototype.hasOwnProperty, ka = /^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/, la = {}, ma = {};
      function oa(a) {
        if (ja.call(ma, a)) return true;
        if (ja.call(la, a)) return false;
        if (ka.test(a)) return ma[a] = true;
        la[a] = true;
        return false;
      }
      function pa(a, b, c, d) {
        if (null !== c && 0 === c.type) return false;
        switch (typeof b) {
          case "function":
          case "symbol":
            return true;
          case "boolean":
            if (d) return false;
            if (null !== c) return !c.acceptsBooleans;
            a = a.toLowerCase().slice(0, 5);
            return "data-" !== a && "aria-" !== a;
          default:
            return false;
        }
      }
      function qa(a, b, c, d) {
        if (null === b || "undefined" === typeof b || pa(a, b, c, d)) return true;
        if (d) return false;
        if (null !== c) switch (c.type) {
          case 3:
            return !b;
          case 4:
            return false === b;
          case 5:
            return isNaN(b);
          case 6:
            return isNaN(b) || 1 > b;
        }
        return false;
      }
      function v(a, b, c, d, e, f, g) {
        this.acceptsBooleans = 2 === b || 3 === b || 4 === b;
        this.attributeName = d;
        this.attributeNamespace = e;
        this.mustUseProperty = c;
        this.propertyName = a;
        this.type = b;
        this.sanitizeURL = f;
        this.removeEmptyString = g;
      }
      var z = {};
      "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a) {
        z[a] = new v(a, 0, false, a, null, false, false);
      });
      [["acceptCharset", "accept-charset"], ["className", "class"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"]].forEach(function(a) {
        var b = a[0];
        z[b] = new v(b, 1, false, a[1], null, false, false);
      });
      ["contentEditable", "draggable", "spellCheck", "value"].forEach(function(a) {
        z[a] = new v(a, 2, false, a.toLowerCase(), null, false, false);
      });
      ["autoReverse", "externalResourcesRequired", "focusable", "preserveAlpha"].forEach(function(a) {
        z[a] = new v(a, 2, false, a, null, false, false);
      });
      "allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a) {
        z[a] = new v(a, 3, false, a.toLowerCase(), null, false, false);
      });
      ["checked", "multiple", "muted", "selected"].forEach(function(a) {
        z[a] = new v(a, 3, true, a, null, false, false);
      });
      ["capture", "download"].forEach(function(a) {
        z[a] = new v(a, 4, false, a, null, false, false);
      });
      ["cols", "rows", "size", "span"].forEach(function(a) {
        z[a] = new v(a, 6, false, a, null, false, false);
      });
      ["rowSpan", "start"].forEach(function(a) {
        z[a] = new v(a, 5, false, a.toLowerCase(), null, false, false);
      });
      var ra = /[\-:]([a-z])/g;
      function sa(a) {
        return a[1].toUpperCase();
      }
      "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a) {
        var b = a.replace(
          ra,
          sa
        );
        z[b] = new v(b, 1, false, a, null, false, false);
      });
      "xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/1999/xlink", false, false);
      });
      ["xml:base", "xml:lang", "xml:space"].forEach(function(a) {
        var b = a.replace(ra, sa);
        z[b] = new v(b, 1, false, a, "http://www.w3.org/XML/1998/namespace", false, false);
      });
      ["tabIndex", "crossOrigin"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, false, false);
      });
      z.xlinkHref = new v("xlinkHref", 1, false, "xlink:href", "http://www.w3.org/1999/xlink", true, false);
      ["src", "href", "action", "formAction"].forEach(function(a) {
        z[a] = new v(a, 1, false, a.toLowerCase(), null, true, true);
      });
      function ta(a, b, c, d) {
        var e = z.hasOwnProperty(b) ? z[b] : null;
        if (null !== e ? 0 !== e.type : d || !(2 < b.length) || "o" !== b[0] && "O" !== b[0] || "n" !== b[1] && "N" !== b[1]) qa(b, c, e, d) && (c = null), d || null === e ? oa(b) && (null === c ? a.removeAttribute(b) : a.setAttribute(b, "" + c)) : e.mustUseProperty ? a[e.propertyName] = null === c ? 3 === e.type ? false : "" : c : (b = e.attributeName, d = e.attributeNamespace, null === c ? a.removeAttribute(b) : (e = e.type, c = 3 === e || 4 === e && true === c ? "" : "" + c, d ? a.setAttributeNS(d, b, c) : a.setAttribute(b, c)));
      }
      var ua = aa.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED, va = Symbol.for("react.element"), wa = Symbol.for("react.portal"), ya = Symbol.for("react.fragment"), za = Symbol.for("react.strict_mode"), Aa = Symbol.for("react.profiler"), Ba = Symbol.for("react.provider"), Ca = Symbol.for("react.context"), Da = Symbol.for("react.forward_ref"), Ea = Symbol.for("react.suspense"), Fa = Symbol.for("react.suspense_list"), Ga = Symbol.for("react.memo"), Ha = Symbol.for("react.lazy");
      var Ia = Symbol.for("react.offscreen");
      var Ja = Symbol.iterator;
      function Ka(a) {
        if (null === a || "object" !== typeof a) return null;
        a = Ja && a[Ja] || a["@@iterator"];
        return "function" === typeof a ? a : null;
      }
      var A = Object.assign, La;
      function Ma(a) {
        if (void 0 === La) try {
          throw Error();
        } catch (c) {
          var b = c.stack.trim().match(/\n( *(at )?)/);
          La = b && b[1] || "";
        }
        return "\n" + La + a;
      }
      var Na = false;
      function Oa(a, b) {
        if (!a || Na) return "";
        Na = true;
        var c = Error.prepareStackTrace;
        Error.prepareStackTrace = void 0;
        try {
          if (b) if (b = function() {
            throw Error();
          }, Object.defineProperty(b.prototype, "props", { set: function() {
            throw Error();
          } }), "object" === typeof Reflect && Reflect.construct) {
            try {
              Reflect.construct(b, []);
            } catch (l) {
              var d = l;
            }
            Reflect.construct(a, [], b);
          } else {
            try {
              b.call();
            } catch (l) {
              d = l;
            }
            a.call(b.prototype);
          }
          else {
            try {
              throw Error();
            } catch (l) {
              d = l;
            }
            a();
          }
        } catch (l) {
          if (l && d && "string" === typeof l.stack) {
            for (var e = l.stack.split("\n"), f = d.stack.split("\n"), g = e.length - 1, h = f.length - 1; 1 <= g && 0 <= h && e[g] !== f[h]; ) h--;
            for (; 1 <= g && 0 <= h; g--, h--) if (e[g] !== f[h]) {
              if (1 !== g || 1 !== h) {
                do
                  if (g--, h--, 0 > h || e[g] !== f[h]) {
                    var k = "\n" + e[g].replace(" at new ", " at ");
                    a.displayName && k.includes("<anonymous>") && (k = k.replace("<anonymous>", a.displayName));
                    return k;
                  }
                while (1 <= g && 0 <= h);
              }
              break;
            }
          }
        } finally {
          Na = false, Error.prepareStackTrace = c;
        }
        return (a = a ? a.displayName || a.name : "") ? Ma(a) : "";
      }
      function Pa(a) {
        switch (a.tag) {
          case 5:
            return Ma(a.type);
          case 16:
            return Ma("Lazy");
          case 13:
            return Ma("Suspense");
          case 19:
            return Ma("SuspenseList");
          case 0:
          case 2:
          case 15:
            return a = Oa(a.type, false), a;
          case 11:
            return a = Oa(a.type.render, false), a;
          case 1:
            return a = Oa(a.type, true), a;
          default:
            return "";
        }
      }
      function Qa(a) {
        if (null == a) return null;
        if ("function" === typeof a) return a.displayName || a.name || null;
        if ("string" === typeof a) return a;
        switch (a) {
          case ya:
            return "Fragment";
          case wa:
            return "Portal";
          case Aa:
            return "Profiler";
          case za:
            return "StrictMode";
          case Ea:
            return "Suspense";
          case Fa:
            return "SuspenseList";
        }
        if ("object" === typeof a) switch (a.$$typeof) {
          case Ca:
            return (a.displayName || "Context") + ".Consumer";
          case Ba:
            return (a._context.displayName || "Context") + ".Provider";
          case Da:
            var b = a.render;
            a = a.displayName;
            a || (a = b.displayName || b.name || "", a = "" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
            return a;
          case Ga:
            return b = a.displayName || null, null !== b ? b : Qa(a.type) || "Memo";
          case Ha:
            b = a._payload;
            a = a._init;
            try {
              return Qa(a(b));
            } catch (c) {
            }
        }
        return null;
      }
      function Ra(a) {
        var b = a.type;
        switch (a.tag) {
          case 24:
            return "Cache";
          case 9:
            return (b.displayName || "Context") + ".Consumer";
          case 10:
            return (b._context.displayName || "Context") + ".Provider";
          case 18:
            return "DehydratedFragment";
          case 11:
            return a = b.render, a = a.displayName || a.name || "", b.displayName || ("" !== a ? "ForwardRef(" + a + ")" : "ForwardRef");
          case 7:
            return "Fragment";
          case 5:
            return b;
          case 4:
            return "Portal";
          case 3:
            return "Root";
          case 6:
            return "Text";
          case 16:
            return Qa(b);
          case 8:
            return b === za ? "StrictMode" : "Mode";
          case 22:
            return "Offscreen";
          case 12:
            return "Profiler";
          case 21:
            return "Scope";
          case 13:
            return "Suspense";
          case 19:
            return "SuspenseList";
          case 25:
            return "TracingMarker";
          case 1:
          case 0:
          case 17:
          case 2:
          case 14:
          case 15:
            if ("function" === typeof b) return b.displayName || b.name || null;
            if ("string" === typeof b) return b;
        }
        return null;
      }
      function Sa(a) {
        switch (typeof a) {
          case "boolean":
          case "number":
          case "string":
          case "undefined":
            return a;
          case "object":
            return a;
          default:
            return "";
        }
      }
      function Ta(a) {
        var b = a.type;
        return (a = a.nodeName) && "input" === a.toLowerCase() && ("checkbox" === b || "radio" === b);
      }
      function Ua(a) {
        var b = Ta(a) ? "checked" : "value", c = Object.getOwnPropertyDescriptor(a.constructor.prototype, b), d = "" + a[b];
        if (!a.hasOwnProperty(b) && "undefined" !== typeof c && "function" === typeof c.get && "function" === typeof c.set) {
          var e = c.get, f = c.set;
          Object.defineProperty(a, b, { configurable: true, get: function() {
            return e.call(this);
          }, set: function(a2) {
            d = "" + a2;
            f.call(this, a2);
          } });
          Object.defineProperty(a, b, { enumerable: c.enumerable });
          return { getValue: function() {
            return d;
          }, setValue: function(a2) {
            d = "" + a2;
          }, stopTracking: function() {
            a._valueTracker = null;
            delete a[b];
          } };
        }
      }
      function Va(a) {
        a._valueTracker || (a._valueTracker = Ua(a));
      }
      function Wa(a) {
        if (!a) return false;
        var b = a._valueTracker;
        if (!b) return true;
        var c = b.getValue();
        var d = "";
        a && (d = Ta(a) ? a.checked ? "true" : "false" : a.value);
        a = d;
        return a !== c ? (b.setValue(a), true) : false;
      }
      function Xa(a) {
        a = a || ("undefined" !== typeof document ? document : void 0);
        if ("undefined" === typeof a) return null;
        try {
          return a.activeElement || a.body;
        } catch (b) {
          return a.body;
        }
      }
      function Ya(a, b) {
        var c = b.checked;
        return A({}, b, { defaultChecked: void 0, defaultValue: void 0, value: void 0, checked: null != c ? c : a._wrapperState.initialChecked });
      }
      function Za(a, b) {
        var c = null == b.defaultValue ? "" : b.defaultValue, d = null != b.checked ? b.checked : b.defaultChecked;
        c = Sa(null != b.value ? b.value : c);
        a._wrapperState = { initialChecked: d, initialValue: c, controlled: "checkbox" === b.type || "radio" === b.type ? null != b.checked : null != b.value };
      }
      function ab(a, b) {
        b = b.checked;
        null != b && ta(a, "checked", b, false);
      }
      function bb(a, b) {
        ab(a, b);
        var c = Sa(b.value), d = b.type;
        if (null != c) if ("number" === d) {
          if (0 === c && "" === a.value || a.value != c) a.value = "" + c;
        } else a.value !== "" + c && (a.value = "" + c);
        else if ("submit" === d || "reset" === d) {
          a.removeAttribute("value");
          return;
        }
        b.hasOwnProperty("value") ? cb(a, b.type, c) : b.hasOwnProperty("defaultValue") && cb(a, b.type, Sa(b.defaultValue));
        null == b.checked && null != b.defaultChecked && (a.defaultChecked = !!b.defaultChecked);
      }
      function db(a, b, c) {
        if (b.hasOwnProperty("value") || b.hasOwnProperty("defaultValue")) {
          var d = b.type;
          if (!("submit" !== d && "reset" !== d || void 0 !== b.value && null !== b.value)) return;
          b = "" + a._wrapperState.initialValue;
          c || b === a.value || (a.value = b);
          a.defaultValue = b;
        }
        c = a.name;
        "" !== c && (a.name = "");
        a.defaultChecked = !!a._wrapperState.initialChecked;
        "" !== c && (a.name = c);
      }
      function cb(a, b, c) {
        if ("number" !== b || Xa(a.ownerDocument) !== a) null == c ? a.defaultValue = "" + a._wrapperState.initialValue : a.defaultValue !== "" + c && (a.defaultValue = "" + c);
      }
      var eb = Array.isArray;
      function fb(a, b, c, d) {
        a = a.options;
        if (b) {
          b = {};
          for (var e = 0; e < c.length; e++) b["$" + c[e]] = true;
          for (c = 0; c < a.length; c++) e = b.hasOwnProperty("$" + a[c].value), a[c].selected !== e && (a[c].selected = e), e && d && (a[c].defaultSelected = true);
        } else {
          c = "" + Sa(c);
          b = null;
          for (e = 0; e < a.length; e++) {
            if (a[e].value === c) {
              a[e].selected = true;
              d && (a[e].defaultSelected = true);
              return;
            }
            null !== b || a[e].disabled || (b = a[e]);
          }
          null !== b && (b.selected = true);
        }
      }
      function gb(a, b) {
        if (null != b.dangerouslySetInnerHTML) throw Error(p(91));
        return A({}, b, { value: void 0, defaultValue: void 0, children: "" + a._wrapperState.initialValue });
      }
      function hb(a, b) {
        var c = b.value;
        if (null == c) {
          c = b.children;
          b = b.defaultValue;
          if (null != c) {
            if (null != b) throw Error(p(92));
            if (eb(c)) {
              if (1 < c.length) throw Error(p(93));
              c = c[0];
            }
            b = c;
          }
          null == b && (b = "");
          c = b;
        }
        a._wrapperState = { initialValue: Sa(c) };
      }
      function ib(a, b) {
        var c = Sa(b.value), d = Sa(b.defaultValue);
        null != c && (c = "" + c, c !== a.value && (a.value = c), null == b.defaultValue && a.defaultValue !== c && (a.defaultValue = c));
        null != d && (a.defaultValue = "" + d);
      }
      function jb(a) {
        var b = a.textContent;
        b === a._wrapperState.initialValue && "" !== b && null !== b && (a.value = b);
      }
      function kb(a) {
        switch (a) {
          case "svg":
            return "http://www.w3.org/2000/svg";
          case "math":
            return "http://www.w3.org/1998/Math/MathML";
          default:
            return "http://www.w3.org/1999/xhtml";
        }
      }
      function lb(a, b) {
        return null == a || "http://www.w3.org/1999/xhtml" === a ? kb(b) : "http://www.w3.org/2000/svg" === a && "foreignObject" === b ? "http://www.w3.org/1999/xhtml" : a;
      }
      var mb, nb = function(a) {
        return "undefined" !== typeof MSApp && MSApp.execUnsafeLocalFunction ? function(b, c, d, e) {
          MSApp.execUnsafeLocalFunction(function() {
            return a(b, c, d, e);
          });
        } : a;
      }(function(a, b) {
        if ("http://www.w3.org/2000/svg" !== a.namespaceURI || "innerHTML" in a) a.innerHTML = b;
        else {
          mb = mb || document.createElement("div");
          mb.innerHTML = "<svg>" + b.valueOf().toString() + "</svg>";
          for (b = mb.firstChild; a.firstChild; ) a.removeChild(a.firstChild);
          for (; b.firstChild; ) a.appendChild(b.firstChild);
        }
      });
      function ob(a, b) {
        if (b) {
          var c = a.firstChild;
          if (c && c === a.lastChild && 3 === c.nodeType) {
            c.nodeValue = b;
            return;
          }
        }
        a.textContent = b;
      }
      var pb = {
        animationIterationCount: true,
        aspectRatio: true,
        borderImageOutset: true,
        borderImageSlice: true,
        borderImageWidth: true,
        boxFlex: true,
        boxFlexGroup: true,
        boxOrdinalGroup: true,
        columnCount: true,
        columns: true,
        flex: true,
        flexGrow: true,
        flexPositive: true,
        flexShrink: true,
        flexNegative: true,
        flexOrder: true,
        gridArea: true,
        gridRow: true,
        gridRowEnd: true,
        gridRowSpan: true,
        gridRowStart: true,
        gridColumn: true,
        gridColumnEnd: true,
        gridColumnSpan: true,
        gridColumnStart: true,
        fontWeight: true,
        lineClamp: true,
        lineHeight: true,
        opacity: true,
        order: true,
        orphans: true,
        tabSize: true,
        widows: true,
        zIndex: true,
        zoom: true,
        fillOpacity: true,
        floodOpacity: true,
        stopOpacity: true,
        strokeDasharray: true,
        strokeDashoffset: true,
        strokeMiterlimit: true,
        strokeOpacity: true,
        strokeWidth: true
      }, qb = ["Webkit", "ms", "Moz", "O"];
      Object.keys(pb).forEach(function(a) {
        qb.forEach(function(b) {
          b = b + a.charAt(0).toUpperCase() + a.substring(1);
          pb[b] = pb[a];
        });
      });
      function rb(a, b, c) {
        return null == b || "boolean" === typeof b || "" === b ? "" : c || "number" !== typeof b || 0 === b || pb.hasOwnProperty(a) && pb[a] ? ("" + b).trim() : b + "px";
      }
      function sb(a, b) {
        a = a.style;
        for (var c in b) if (b.hasOwnProperty(c)) {
          var d = 0 === c.indexOf("--"), e = rb(c, b[c], d);
          "float" === c && (c = "cssFloat");
          d ? a.setProperty(c, e) : a[c] = e;
        }
      }
      var tb = A({ menuitem: true }, { area: true, base: true, br: true, col: true, embed: true, hr: true, img: true, input: true, keygen: true, link: true, meta: true, param: true, source: true, track: true, wbr: true });
      function ub(a, b) {
        if (b) {
          if (tb[a] && (null != b.children || null != b.dangerouslySetInnerHTML)) throw Error(p(137, a));
          if (null != b.dangerouslySetInnerHTML) {
            if (null != b.children) throw Error(p(60));
            if ("object" !== typeof b.dangerouslySetInnerHTML || !("__html" in b.dangerouslySetInnerHTML)) throw Error(p(61));
          }
          if (null != b.style && "object" !== typeof b.style) throw Error(p(62));
        }
      }
      function vb(a, b) {
        if (-1 === a.indexOf("-")) return "string" === typeof b.is;
        switch (a) {
          case "annotation-xml":
          case "color-profile":
          case "font-face":
          case "font-face-src":
          case "font-face-uri":
          case "font-face-format":
          case "font-face-name":
          case "missing-glyph":
            return false;
          default:
            return true;
        }
      }
      var wb = null;
      function xb(a) {
        a = a.target || a.srcElement || window;
        a.correspondingUseElement && (a = a.correspondingUseElement);
        return 3 === a.nodeType ? a.parentNode : a;
      }
      var yb = null, zb = null, Ab = null;
      function Bb(a) {
        if (a = Cb(a)) {
          if ("function" !== typeof yb) throw Error(p(280));
          var b = a.stateNode;
          b && (b = Db(b), yb(a.stateNode, a.type, b));
        }
      }
      function Eb(a) {
        zb ? Ab ? Ab.push(a) : Ab = [a] : zb = a;
      }
      function Fb() {
        if (zb) {
          var a = zb, b = Ab;
          Ab = zb = null;
          Bb(a);
          if (b) for (a = 0; a < b.length; a++) Bb(b[a]);
        }
      }
      function Gb(a, b) {
        return a(b);
      }
      function Hb() {
      }
      var Ib = false;
      function Jb(a, b, c) {
        if (Ib) return a(b, c);
        Ib = true;
        try {
          return Gb(a, b, c);
        } finally {
          if (Ib = false, null !== zb || null !== Ab) Hb(), Fb();
        }
      }
      function Kb(a, b) {
        var c = a.stateNode;
        if (null === c) return null;
        var d = Db(c);
        if (null === d) return null;
        c = d[b];
        a: switch (b) {
          case "onClick":
          case "onClickCapture":
          case "onDoubleClick":
          case "onDoubleClickCapture":
          case "onMouseDown":
          case "onMouseDownCapture":
          case "onMouseMove":
          case "onMouseMoveCapture":
          case "onMouseUp":
          case "onMouseUpCapture":
          case "onMouseEnter":
            (d = !d.disabled) || (a = a.type, d = !("button" === a || "input" === a || "select" === a || "textarea" === a));
            a = !d;
            break a;
          default:
            a = false;
        }
        if (a) return null;
        if (c && "function" !== typeof c) throw Error(p(231, b, typeof c));
        return c;
      }
      var Lb = false;
      if (ia) try {
        var Mb = {};
        Object.defineProperty(Mb, "passive", { get: function() {
          Lb = true;
        } });
        window.addEventListener("test", Mb, Mb);
        window.removeEventListener("test", Mb, Mb);
      } catch (a) {
        Lb = false;
      }
      function Nb(a, b, c, d, e, f, g, h, k) {
        var l = Array.prototype.slice.call(arguments, 3);
        try {
          b.apply(c, l);
        } catch (m) {
          this.onError(m);
        }
      }
      var Ob = false, Pb = null, Qb = false, Rb = null, Sb = { onError: function(a) {
        Ob = true;
        Pb = a;
      } };
      function Tb(a, b, c, d, e, f, g, h, k) {
        Ob = false;
        Pb = null;
        Nb.apply(Sb, arguments);
      }
      function Ub(a, b, c, d, e, f, g, h, k) {
        Tb.apply(this, arguments);
        if (Ob) {
          if (Ob) {
            var l = Pb;
            Ob = false;
            Pb = null;
          } else throw Error(p(198));
          Qb || (Qb = true, Rb = l);
        }
      }
      function Vb(a) {
        var b = a, c = a;
        if (a.alternate) for (; b.return; ) b = b.return;
        else {
          a = b;
          do
            b = a, 0 !== (b.flags & 4098) && (c = b.return), a = b.return;
          while (a);
        }
        return 3 === b.tag ? c : null;
      }
      function Wb(a) {
        if (13 === a.tag) {
          var b = a.memoizedState;
          null === b && (a = a.alternate, null !== a && (b = a.memoizedState));
          if (null !== b) return b.dehydrated;
        }
        return null;
      }
      function Xb(a) {
        if (Vb(a) !== a) throw Error(p(188));
      }
      function Yb(a) {
        var b = a.alternate;
        if (!b) {
          b = Vb(a);
          if (null === b) throw Error(p(188));
          return b !== a ? null : a;
        }
        for (var c = a, d = b; ; ) {
          var e = c.return;
          if (null === e) break;
          var f = e.alternate;
          if (null === f) {
            d = e.return;
            if (null !== d) {
              c = d;
              continue;
            }
            break;
          }
          if (e.child === f.child) {
            for (f = e.child; f; ) {
              if (f === c) return Xb(e), a;
              if (f === d) return Xb(e), b;
              f = f.sibling;
            }
            throw Error(p(188));
          }
          if (c.return !== d.return) c = e, d = f;
          else {
            for (var g = false, h = e.child; h; ) {
              if (h === c) {
                g = true;
                c = e;
                d = f;
                break;
              }
              if (h === d) {
                g = true;
                d = e;
                c = f;
                break;
              }
              h = h.sibling;
            }
            if (!g) {
              for (h = f.child; h; ) {
                if (h === c) {
                  g = true;
                  c = f;
                  d = e;
                  break;
                }
                if (h === d) {
                  g = true;
                  d = f;
                  c = e;
                  break;
                }
                h = h.sibling;
              }
              if (!g) throw Error(p(189));
            }
          }
          if (c.alternate !== d) throw Error(p(190));
        }
        if (3 !== c.tag) throw Error(p(188));
        return c.stateNode.current === c ? a : b;
      }
      function Zb(a) {
        a = Yb(a);
        return null !== a ? $b(a) : null;
      }
      function $b(a) {
        if (5 === a.tag || 6 === a.tag) return a;
        for (a = a.child; null !== a; ) {
          var b = $b(a);
          if (null !== b) return b;
          a = a.sibling;
        }
        return null;
      }
      var ac = ca.unstable_scheduleCallback, bc = ca.unstable_cancelCallback, cc = ca.unstable_shouldYield, dc = ca.unstable_requestPaint, B = ca.unstable_now, ec = ca.unstable_getCurrentPriorityLevel, fc = ca.unstable_ImmediatePriority, gc = ca.unstable_UserBlockingPriority, hc = ca.unstable_NormalPriority, ic = ca.unstable_LowPriority, jc = ca.unstable_IdlePriority, kc = null, lc = null;
      function mc(a) {
        if (lc && "function" === typeof lc.onCommitFiberRoot) try {
          lc.onCommitFiberRoot(kc, a, void 0, 128 === (a.current.flags & 128));
        } catch (b) {
        }
      }
      var oc = Math.clz32 ? Math.clz32 : nc, pc = Math.log, qc = Math.LN2;
      function nc(a) {
        a >>>= 0;
        return 0 === a ? 32 : 31 - (pc(a) / qc | 0) | 0;
      }
      var rc = 64, sc = 4194304;
      function tc(a) {
        switch (a & -a) {
          case 1:
            return 1;
          case 2:
            return 2;
          case 4:
            return 4;
          case 8:
            return 8;
          case 16:
            return 16;
          case 32:
            return 32;
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return a & 4194240;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return a & 130023424;
          case 134217728:
            return 134217728;
          case 268435456:
            return 268435456;
          case 536870912:
            return 536870912;
          case 1073741824:
            return 1073741824;
          default:
            return a;
        }
      }
      function uc(a, b) {
        var c = a.pendingLanes;
        if (0 === c) return 0;
        var d = 0, e = a.suspendedLanes, f = a.pingedLanes, g = c & 268435455;
        if (0 !== g) {
          var h = g & ~e;
          0 !== h ? d = tc(h) : (f &= g, 0 !== f && (d = tc(f)));
        } else g = c & ~e, 0 !== g ? d = tc(g) : 0 !== f && (d = tc(f));
        if (0 === d) return 0;
        if (0 !== b && b !== d && 0 === (b & e) && (e = d & -d, f = b & -b, e >= f || 16 === e && 0 !== (f & 4194240))) return b;
        0 !== (d & 4) && (d |= c & 16);
        b = a.entangledLanes;
        if (0 !== b) for (a = a.entanglements, b &= d; 0 < b; ) c = 31 - oc(b), e = 1 << c, d |= a[c], b &= ~e;
        return d;
      }
      function vc(a, b) {
        switch (a) {
          case 1:
          case 2:
          case 4:
            return b + 250;
          case 8:
          case 16:
          case 32:
          case 64:
          case 128:
          case 256:
          case 512:
          case 1024:
          case 2048:
          case 4096:
          case 8192:
          case 16384:
          case 32768:
          case 65536:
          case 131072:
          case 262144:
          case 524288:
          case 1048576:
          case 2097152:
            return b + 5e3;
          case 4194304:
          case 8388608:
          case 16777216:
          case 33554432:
          case 67108864:
            return -1;
          case 134217728:
          case 268435456:
          case 536870912:
          case 1073741824:
            return -1;
          default:
            return -1;
        }
      }
      function wc(a, b) {
        for (var c = a.suspendedLanes, d = a.pingedLanes, e = a.expirationTimes, f = a.pendingLanes; 0 < f; ) {
          var g = 31 - oc(f), h = 1 << g, k = e[g];
          if (-1 === k) {
            if (0 === (h & c) || 0 !== (h & d)) e[g] = vc(h, b);
          } else k <= b && (a.expiredLanes |= h);
          f &= ~h;
        }
      }
      function xc(a) {
        a = a.pendingLanes & -1073741825;
        return 0 !== a ? a : a & 1073741824 ? 1073741824 : 0;
      }
      function yc() {
        var a = rc;
        rc <<= 1;
        0 === (rc & 4194240) && (rc = 64);
        return a;
      }
      function zc(a) {
        for (var b = [], c = 0; 31 > c; c++) b.push(a);
        return b;
      }
      function Ac(a, b, c) {
        a.pendingLanes |= b;
        536870912 !== b && (a.suspendedLanes = 0, a.pingedLanes = 0);
        a = a.eventTimes;
        b = 31 - oc(b);
        a[b] = c;
      }
      function Bc(a, b) {
        var c = a.pendingLanes & ~b;
        a.pendingLanes = b;
        a.suspendedLanes = 0;
        a.pingedLanes = 0;
        a.expiredLanes &= b;
        a.mutableReadLanes &= b;
        a.entangledLanes &= b;
        b = a.entanglements;
        var d = a.eventTimes;
        for (a = a.expirationTimes; 0 < c; ) {
          var e = 31 - oc(c), f = 1 << e;
          b[e] = 0;
          d[e] = -1;
          a[e] = -1;
          c &= ~f;
        }
      }
      function Cc(a, b) {
        var c = a.entangledLanes |= b;
        for (a = a.entanglements; c; ) {
          var d = 31 - oc(c), e = 1 << d;
          e & b | a[d] & b && (a[d] |= b);
          c &= ~e;
        }
      }
      var C = 0;
      function Dc(a) {
        a &= -a;
        return 1 < a ? 4 < a ? 0 !== (a & 268435455) ? 16 : 536870912 : 4 : 1;
      }
      var Ec, Fc, Gc, Hc, Ic, Jc = false, Kc = [], Lc = null, Mc = null, Nc = null, Oc = /* @__PURE__ */ new Map(), Pc = /* @__PURE__ */ new Map(), Qc = [], Rc = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");
      function Sc(a, b) {
        switch (a) {
          case "focusin":
          case "focusout":
            Lc = null;
            break;
          case "dragenter":
          case "dragleave":
            Mc = null;
            break;
          case "mouseover":
          case "mouseout":
            Nc = null;
            break;
          case "pointerover":
          case "pointerout":
            Oc.delete(b.pointerId);
            break;
          case "gotpointercapture":
          case "lostpointercapture":
            Pc.delete(b.pointerId);
        }
      }
      function Tc(a, b, c, d, e, f) {
        if (null === a || a.nativeEvent !== f) return a = { blockedOn: b, domEventName: c, eventSystemFlags: d, nativeEvent: f, targetContainers: [e] }, null !== b && (b = Cb(b), null !== b && Fc(b)), a;
        a.eventSystemFlags |= d;
        b = a.targetContainers;
        null !== e && -1 === b.indexOf(e) && b.push(e);
        return a;
      }
      function Uc(a, b, c, d, e) {
        switch (b) {
          case "focusin":
            return Lc = Tc(Lc, a, b, c, d, e), true;
          case "dragenter":
            return Mc = Tc(Mc, a, b, c, d, e), true;
          case "mouseover":
            return Nc = Tc(Nc, a, b, c, d, e), true;
          case "pointerover":
            var f = e.pointerId;
            Oc.set(f, Tc(Oc.get(f) || null, a, b, c, d, e));
            return true;
          case "gotpointercapture":
            return f = e.pointerId, Pc.set(f, Tc(Pc.get(f) || null, a, b, c, d, e)), true;
        }
        return false;
      }
      function Vc(a) {
        var b = Wc(a.target);
        if (null !== b) {
          var c = Vb(b);
          if (null !== c) {
            if (b = c.tag, 13 === b) {
              if (b = Wb(c), null !== b) {
                a.blockedOn = b;
                Ic(a.priority, function() {
                  Gc(c);
                });
                return;
              }
            } else if (3 === b && c.stateNode.current.memoizedState.isDehydrated) {
              a.blockedOn = 3 === c.tag ? c.stateNode.containerInfo : null;
              return;
            }
          }
        }
        a.blockedOn = null;
      }
      function Xc(a) {
        if (null !== a.blockedOn) return false;
        for (var b = a.targetContainers; 0 < b.length; ) {
          var c = Yc(a.domEventName, a.eventSystemFlags, b[0], a.nativeEvent);
          if (null === c) {
            c = a.nativeEvent;
            var d = new c.constructor(c.type, c);
            wb = d;
            c.target.dispatchEvent(d);
            wb = null;
          } else return b = Cb(c), null !== b && Fc(b), a.blockedOn = c, false;
          b.shift();
        }
        return true;
      }
      function Zc(a, b, c) {
        Xc(a) && c.delete(b);
      }
      function $c() {
        Jc = false;
        null !== Lc && Xc(Lc) && (Lc = null);
        null !== Mc && Xc(Mc) && (Mc = null);
        null !== Nc && Xc(Nc) && (Nc = null);
        Oc.forEach(Zc);
        Pc.forEach(Zc);
      }
      function ad(a, b) {
        a.blockedOn === b && (a.blockedOn = null, Jc || (Jc = true, ca.unstable_scheduleCallback(ca.unstable_NormalPriority, $c)));
      }
      function bd(a) {
        function b(b2) {
          return ad(b2, a);
        }
        if (0 < Kc.length) {
          ad(Kc[0], a);
          for (var c = 1; c < Kc.length; c++) {
            var d = Kc[c];
            d.blockedOn === a && (d.blockedOn = null);
          }
        }
        null !== Lc && ad(Lc, a);
        null !== Mc && ad(Mc, a);
        null !== Nc && ad(Nc, a);
        Oc.forEach(b);
        Pc.forEach(b);
        for (c = 0; c < Qc.length; c++) d = Qc[c], d.blockedOn === a && (d.blockedOn = null);
        for (; 0 < Qc.length && (c = Qc[0], null === c.blockedOn); ) Vc(c), null === c.blockedOn && Qc.shift();
      }
      var cd = ua.ReactCurrentBatchConfig, dd = true;
      function ed(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 1, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function gd(a, b, c, d) {
        var e = C, f = cd.transition;
        cd.transition = null;
        try {
          C = 4, fd(a, b, c, d);
        } finally {
          C = e, cd.transition = f;
        }
      }
      function fd(a, b, c, d) {
        if (dd) {
          var e = Yc(a, b, c, d);
          if (null === e) hd(a, b, d, id, c), Sc(a, d);
          else if (Uc(e, a, b, c, d)) d.stopPropagation();
          else if (Sc(a, d), b & 4 && -1 < Rc.indexOf(a)) {
            for (; null !== e; ) {
              var f = Cb(e);
              null !== f && Ec(f);
              f = Yc(a, b, c, d);
              null === f && hd(a, b, d, id, c);
              if (f === e) break;
              e = f;
            }
            null !== e && d.stopPropagation();
          } else hd(a, b, d, null, c);
        }
      }
      var id = null;
      function Yc(a, b, c, d) {
        id = null;
        a = xb(d);
        a = Wc(a);
        if (null !== a) if (b = Vb(a), null === b) a = null;
        else if (c = b.tag, 13 === c) {
          a = Wb(b);
          if (null !== a) return a;
          a = null;
        } else if (3 === c) {
          if (b.stateNode.current.memoizedState.isDehydrated) return 3 === b.tag ? b.stateNode.containerInfo : null;
          a = null;
        } else b !== a && (a = null);
        id = a;
        return null;
      }
      function jd(a) {
        switch (a) {
          case "cancel":
          case "click":
          case "close":
          case "contextmenu":
          case "copy":
          case "cut":
          case "auxclick":
          case "dblclick":
          case "dragend":
          case "dragstart":
          case "drop":
          case "focusin":
          case "focusout":
          case "input":
          case "invalid":
          case "keydown":
          case "keypress":
          case "keyup":
          case "mousedown":
          case "mouseup":
          case "paste":
          case "pause":
          case "play":
          case "pointercancel":
          case "pointerdown":
          case "pointerup":
          case "ratechange":
          case "reset":
          case "resize":
          case "seeked":
          case "submit":
          case "touchcancel":
          case "touchend":
          case "touchstart":
          case "volumechange":
          case "change":
          case "selectionchange":
          case "textInput":
          case "compositionstart":
          case "compositionend":
          case "compositionupdate":
          case "beforeblur":
          case "afterblur":
          case "beforeinput":
          case "blur":
          case "fullscreenchange":
          case "focus":
          case "hashchange":
          case "popstate":
          case "select":
          case "selectstart":
            return 1;
          case "drag":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "mousemove":
          case "mouseout":
          case "mouseover":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "scroll":
          case "toggle":
          case "touchmove":
          case "wheel":
          case "mouseenter":
          case "mouseleave":
          case "pointerenter":
          case "pointerleave":
            return 4;
          case "message":
            switch (ec()) {
              case fc:
                return 1;
              case gc:
                return 4;
              case hc:
              case ic:
                return 16;
              case jc:
                return 536870912;
              default:
                return 16;
            }
          default:
            return 16;
        }
      }
      var kd = null, ld = null, md = null;
      function nd() {
        if (md) return md;
        var a, b = ld, c = b.length, d, e = "value" in kd ? kd.value : kd.textContent, f = e.length;
        for (a = 0; a < c && b[a] === e[a]; a++) ;
        var g = c - a;
        for (d = 1; d <= g && b[c - d] === e[f - d]; d++) ;
        return md = e.slice(a, 1 < d ? 1 - d : void 0);
      }
      function od(a) {
        var b = a.keyCode;
        "charCode" in a ? (a = a.charCode, 0 === a && 13 === b && (a = 13)) : a = b;
        10 === a && (a = 13);
        return 32 <= a || 13 === a ? a : 0;
      }
      function pd() {
        return true;
      }
      function qd() {
        return false;
      }
      function rd(a) {
        function b(b2, d, e, f, g) {
          this._reactName = b2;
          this._targetInst = e;
          this.type = d;
          this.nativeEvent = f;
          this.target = g;
          this.currentTarget = null;
          for (var c in a) a.hasOwnProperty(c) && (b2 = a[c], this[c] = b2 ? b2(f) : f[c]);
          this.isDefaultPrevented = (null != f.defaultPrevented ? f.defaultPrevented : false === f.returnValue) ? pd : qd;
          this.isPropagationStopped = qd;
          return this;
        }
        A(b.prototype, { preventDefault: function() {
          this.defaultPrevented = true;
          var a2 = this.nativeEvent;
          a2 && (a2.preventDefault ? a2.preventDefault() : "unknown" !== typeof a2.returnValue && (a2.returnValue = false), this.isDefaultPrevented = pd);
        }, stopPropagation: function() {
          var a2 = this.nativeEvent;
          a2 && (a2.stopPropagation ? a2.stopPropagation() : "unknown" !== typeof a2.cancelBubble && (a2.cancelBubble = true), this.isPropagationStopped = pd);
        }, persist: function() {
        }, isPersistent: pd });
        return b;
      }
      var sd = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(a) {
        return a.timeStamp || Date.now();
      }, defaultPrevented: 0, isTrusted: 0 }, td = rd(sd), ud = A({}, sd, { view: 0, detail: 0 }), vd = rd(ud), wd, xd, yd, Ad = A({}, ud, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: zd, button: 0, buttons: 0, relatedTarget: function(a) {
        return void 0 === a.relatedTarget ? a.fromElement === a.srcElement ? a.toElement : a.fromElement : a.relatedTarget;
      }, movementX: function(a) {
        if ("movementX" in a) return a.movementX;
        a !== yd && (yd && "mousemove" === a.type ? (wd = a.screenX - yd.screenX, xd = a.screenY - yd.screenY) : xd = wd = 0, yd = a);
        return wd;
      }, movementY: function(a) {
        return "movementY" in a ? a.movementY : xd;
      } }), Bd = rd(Ad), Cd = A({}, Ad, { dataTransfer: 0 }), Dd = rd(Cd), Ed = A({}, ud, { relatedTarget: 0 }), Fd = rd(Ed), Gd = A({}, sd, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Hd = rd(Gd), Id = A({}, sd, { clipboardData: function(a) {
        return "clipboardData" in a ? a.clipboardData : window.clipboardData;
      } }), Jd = rd(Id), Kd = A({}, sd, { data: 0 }), Ld = rd(Kd), Md = {
        Esc: "Escape",
        Spacebar: " ",
        Left: "ArrowLeft",
        Up: "ArrowUp",
        Right: "ArrowRight",
        Down: "ArrowDown",
        Del: "Delete",
        Win: "OS",
        Menu: "ContextMenu",
        Apps: "ContextMenu",
        Scroll: "ScrollLock",
        MozPrintableKey: "Unidentified"
      }, Nd = {
        8: "Backspace",
        9: "Tab",
        12: "Clear",
        13: "Enter",
        16: "Shift",
        17: "Control",
        18: "Alt",
        19: "Pause",
        20: "CapsLock",
        27: "Escape",
        32: " ",
        33: "PageUp",
        34: "PageDown",
        35: "End",
        36: "Home",
        37: "ArrowLeft",
        38: "ArrowUp",
        39: "ArrowRight",
        40: "ArrowDown",
        45: "Insert",
        46: "Delete",
        112: "F1",
        113: "F2",
        114: "F3",
        115: "F4",
        116: "F5",
        117: "F6",
        118: "F7",
        119: "F8",
        120: "F9",
        121: "F10",
        122: "F11",
        123: "F12",
        144: "NumLock",
        145: "ScrollLock",
        224: "Meta"
      }, Od = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
      function Pd(a) {
        var b = this.nativeEvent;
        return b.getModifierState ? b.getModifierState(a) : (a = Od[a]) ? !!b[a] : false;
      }
      function zd() {
        return Pd;
      }
      var Qd = A({}, ud, { key: function(a) {
        if (a.key) {
          var b = Md[a.key] || a.key;
          if ("Unidentified" !== b) return b;
        }
        return "keypress" === a.type ? (a = od(a), 13 === a ? "Enter" : String.fromCharCode(a)) : "keydown" === a.type || "keyup" === a.type ? Nd[a.keyCode] || "Unidentified" : "";
      }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: zd, charCode: function(a) {
        return "keypress" === a.type ? od(a) : 0;
      }, keyCode: function(a) {
        return "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      }, which: function(a) {
        return "keypress" === a.type ? od(a) : "keydown" === a.type || "keyup" === a.type ? a.keyCode : 0;
      } }), Rd = rd(Qd), Sd = A({}, Ad, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Td = rd(Sd), Ud = A({}, ud, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: zd }), Vd = rd(Ud), Wd = A({}, sd, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), Xd = rd(Wd), Yd = A({}, Ad, {
        deltaX: function(a) {
          return "deltaX" in a ? a.deltaX : "wheelDeltaX" in a ? -a.wheelDeltaX : 0;
        },
        deltaY: function(a) {
          return "deltaY" in a ? a.deltaY : "wheelDeltaY" in a ? -a.wheelDeltaY : "wheelDelta" in a ? -a.wheelDelta : 0;
        },
        deltaZ: 0,
        deltaMode: 0
      }), Zd = rd(Yd), $d = [9, 13, 27, 32], ae = ia && "CompositionEvent" in window, be = null;
      ia && "documentMode" in document && (be = document.documentMode);
      var ce = ia && "TextEvent" in window && !be, de = ia && (!ae || be && 8 < be && 11 >= be), ee = String.fromCharCode(32), fe = false;
      function ge(a, b) {
        switch (a) {
          case "keyup":
            return -1 !== $d.indexOf(b.keyCode);
          case "keydown":
            return 229 !== b.keyCode;
          case "keypress":
          case "mousedown":
          case "focusout":
            return true;
          default:
            return false;
        }
      }
      function he(a) {
        a = a.detail;
        return "object" === typeof a && "data" in a ? a.data : null;
      }
      var ie = false;
      function je(a, b) {
        switch (a) {
          case "compositionend":
            return he(b);
          case "keypress":
            if (32 !== b.which) return null;
            fe = true;
            return ee;
          case "textInput":
            return a = b.data, a === ee && fe ? null : a;
          default:
            return null;
        }
      }
      function ke(a, b) {
        if (ie) return "compositionend" === a || !ae && ge(a, b) ? (a = nd(), md = ld = kd = null, ie = false, a) : null;
        switch (a) {
          case "paste":
            return null;
          case "keypress":
            if (!(b.ctrlKey || b.altKey || b.metaKey) || b.ctrlKey && b.altKey) {
              if (b.char && 1 < b.char.length) return b.char;
              if (b.which) return String.fromCharCode(b.which);
            }
            return null;
          case "compositionend":
            return de && "ko" !== b.locale ? null : b.data;
          default:
            return null;
        }
      }
      var le = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
      function me(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return "input" === b ? !!le[a.type] : "textarea" === b ? true : false;
      }
      function ne(a, b, c, d) {
        Eb(d);
        b = oe(b, "onChange");
        0 < b.length && (c = new td("onChange", "change", null, c, d), a.push({ event: c, listeners: b }));
      }
      var pe = null, qe = null;
      function re(a) {
        se(a, 0);
      }
      function te(a) {
        var b = ue(a);
        if (Wa(b)) return a;
      }
      function ve(a, b) {
        if ("change" === a) return b;
      }
      var we = false;
      if (ia) {
        var xe;
        if (ia) {
          var ye = "oninput" in document;
          if (!ye) {
            var ze = document.createElement("div");
            ze.setAttribute("oninput", "return;");
            ye = "function" === typeof ze.oninput;
          }
          xe = ye;
        } else xe = false;
        we = xe && (!document.documentMode || 9 < document.documentMode);
      }
      function Ae() {
        pe && (pe.detachEvent("onpropertychange", Be), qe = pe = null);
      }
      function Be(a) {
        if ("value" === a.propertyName && te(qe)) {
          var b = [];
          ne(b, qe, a, xb(a));
          Jb(re, b);
        }
      }
      function Ce(a, b, c) {
        "focusin" === a ? (Ae(), pe = b, qe = c, pe.attachEvent("onpropertychange", Be)) : "focusout" === a && Ae();
      }
      function De(a) {
        if ("selectionchange" === a || "keyup" === a || "keydown" === a) return te(qe);
      }
      function Ee(a, b) {
        if ("click" === a) return te(b);
      }
      function Fe(a, b) {
        if ("input" === a || "change" === a) return te(b);
      }
      function Ge(a, b) {
        return a === b && (0 !== a || 1 / a === 1 / b) || a !== a && b !== b;
      }
      var He = "function" === typeof Object.is ? Object.is : Ge;
      function Ie(a, b) {
        if (He(a, b)) return true;
        if ("object" !== typeof a || null === a || "object" !== typeof b || null === b) return false;
        var c = Object.keys(a), d = Object.keys(b);
        if (c.length !== d.length) return false;
        for (d = 0; d < c.length; d++) {
          var e = c[d];
          if (!ja.call(b, e) || !He(a[e], b[e])) return false;
        }
        return true;
      }
      function Je(a) {
        for (; a && a.firstChild; ) a = a.firstChild;
        return a;
      }
      function Ke(a, b) {
        var c = Je(a);
        a = 0;
        for (var d; c; ) {
          if (3 === c.nodeType) {
            d = a + c.textContent.length;
            if (a <= b && d >= b) return { node: c, offset: b - a };
            a = d;
          }
          a: {
            for (; c; ) {
              if (c.nextSibling) {
                c = c.nextSibling;
                break a;
              }
              c = c.parentNode;
            }
            c = void 0;
          }
          c = Je(c);
        }
      }
      function Le(a, b) {
        return a && b ? a === b ? true : a && 3 === a.nodeType ? false : b && 3 === b.nodeType ? Le(a, b.parentNode) : "contains" in a ? a.contains(b) : a.compareDocumentPosition ? !!(a.compareDocumentPosition(b) & 16) : false : false;
      }
      function Me() {
        for (var a = window, b = Xa(); b instanceof a.HTMLIFrameElement; ) {
          try {
            var c = "string" === typeof b.contentWindow.location.href;
          } catch (d) {
            c = false;
          }
          if (c) a = b.contentWindow;
          else break;
          b = Xa(a.document);
        }
        return b;
      }
      function Ne(a) {
        var b = a && a.nodeName && a.nodeName.toLowerCase();
        return b && ("input" === b && ("text" === a.type || "search" === a.type || "tel" === a.type || "url" === a.type || "password" === a.type) || "textarea" === b || "true" === a.contentEditable);
      }
      function Oe(a) {
        var b = Me(), c = a.focusedElem, d = a.selectionRange;
        if (b !== c && c && c.ownerDocument && Le(c.ownerDocument.documentElement, c)) {
          if (null !== d && Ne(c)) {
            if (b = d.start, a = d.end, void 0 === a && (a = b), "selectionStart" in c) c.selectionStart = b, c.selectionEnd = Math.min(a, c.value.length);
            else if (a = (b = c.ownerDocument || document) && b.defaultView || window, a.getSelection) {
              a = a.getSelection();
              var e = c.textContent.length, f = Math.min(d.start, e);
              d = void 0 === d.end ? f : Math.min(d.end, e);
              !a.extend && f > d && (e = d, d = f, f = e);
              e = Ke(c, f);
              var g = Ke(
                c,
                d
              );
              e && g && (1 !== a.rangeCount || a.anchorNode !== e.node || a.anchorOffset !== e.offset || a.focusNode !== g.node || a.focusOffset !== g.offset) && (b = b.createRange(), b.setStart(e.node, e.offset), a.removeAllRanges(), f > d ? (a.addRange(b), a.extend(g.node, g.offset)) : (b.setEnd(g.node, g.offset), a.addRange(b)));
            }
          }
          b = [];
          for (a = c; a = a.parentNode; ) 1 === a.nodeType && b.push({ element: a, left: a.scrollLeft, top: a.scrollTop });
          "function" === typeof c.focus && c.focus();
          for (c = 0; c < b.length; c++) a = b[c], a.element.scrollLeft = a.left, a.element.scrollTop = a.top;
        }
      }
      var Pe = ia && "documentMode" in document && 11 >= document.documentMode, Qe = null, Re = null, Se = null, Te = false;
      function Ue(a, b, c) {
        var d = c.window === c ? c.document : 9 === c.nodeType ? c : c.ownerDocument;
        Te || null == Qe || Qe !== Xa(d) || (d = Qe, "selectionStart" in d && Ne(d) ? d = { start: d.selectionStart, end: d.selectionEnd } : (d = (d.ownerDocument && d.ownerDocument.defaultView || window).getSelection(), d = { anchorNode: d.anchorNode, anchorOffset: d.anchorOffset, focusNode: d.focusNode, focusOffset: d.focusOffset }), Se && Ie(Se, d) || (Se = d, d = oe(Re, "onSelect"), 0 < d.length && (b = new td("onSelect", "select", null, b, c), a.push({ event: b, listeners: d }), b.target = Qe)));
      }
      function Ve(a, b) {
        var c = {};
        c[a.toLowerCase()] = b.toLowerCase();
        c["Webkit" + a] = "webkit" + b;
        c["Moz" + a] = "moz" + b;
        return c;
      }
      var We = { animationend: Ve("Animation", "AnimationEnd"), animationiteration: Ve("Animation", "AnimationIteration"), animationstart: Ve("Animation", "AnimationStart"), transitionend: Ve("Transition", "TransitionEnd") }, Xe = {}, Ye = {};
      ia && (Ye = document.createElement("div").style, "AnimationEvent" in window || (delete We.animationend.animation, delete We.animationiteration.animation, delete We.animationstart.animation), "TransitionEvent" in window || delete We.transitionend.transition);
      function Ze(a) {
        if (Xe[a]) return Xe[a];
        if (!We[a]) return a;
        var b = We[a], c;
        for (c in b) if (b.hasOwnProperty(c) && c in Ye) return Xe[a] = b[c];
        return a;
      }
      var $e = Ze("animationend"), af = Ze("animationiteration"), bf = Ze("animationstart"), cf = Ze("transitionend"), df = /* @__PURE__ */ new Map(), ef = "abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
      function ff(a, b) {
        df.set(a, b);
        fa(b, [a]);
      }
      for (var gf = 0; gf < ef.length; gf++) {
        var hf = ef[gf], jf = hf.toLowerCase(), kf = hf[0].toUpperCase() + hf.slice(1);
        ff(jf, "on" + kf);
      }
      ff($e, "onAnimationEnd");
      ff(af, "onAnimationIteration");
      ff(bf, "onAnimationStart");
      ff("dblclick", "onDoubleClick");
      ff("focusin", "onFocus");
      ff("focusout", "onBlur");
      ff(cf, "onTransitionEnd");
      ha("onMouseEnter", ["mouseout", "mouseover"]);
      ha("onMouseLeave", ["mouseout", "mouseover"]);
      ha("onPointerEnter", ["pointerout", "pointerover"]);
      ha("onPointerLeave", ["pointerout", "pointerover"]);
      fa("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
      fa("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
      fa("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]);
      fa("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
      fa("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
      var lf = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), mf = new Set("cancel close invalid load scroll toggle".split(" ").concat(lf));
      function nf(a, b, c) {
        var d = a.type || "unknown-event";
        a.currentTarget = c;
        Ub(d, b, void 0, a);
        a.currentTarget = null;
      }
      function se(a, b) {
        b = 0 !== (b & 4);
        for (var c = 0; c < a.length; c++) {
          var d = a[c], e = d.event;
          d = d.listeners;
          a: {
            var f = void 0;
            if (b) for (var g = d.length - 1; 0 <= g; g--) {
              var h = d[g], k = h.instance, l = h.currentTarget;
              h = h.listener;
              if (k !== f && e.isPropagationStopped()) break a;
              nf(e, h, l);
              f = k;
            }
            else for (g = 0; g < d.length; g++) {
              h = d[g];
              k = h.instance;
              l = h.currentTarget;
              h = h.listener;
              if (k !== f && e.isPropagationStopped()) break a;
              nf(e, h, l);
              f = k;
            }
          }
        }
        if (Qb) throw a = Rb, Qb = false, Rb = null, a;
      }
      function D(a, b) {
        var c = b[of];
        void 0 === c && (c = b[of] = /* @__PURE__ */ new Set());
        var d = a + "__bubble";
        c.has(d) || (pf(b, a, 2, false), c.add(d));
      }
      function qf(a, b, c) {
        var d = 0;
        b && (d |= 4);
        pf(c, a, d, b);
      }
      var rf = "_reactListening" + Math.random().toString(36).slice(2);
      function sf(a) {
        if (!a[rf]) {
          a[rf] = true;
          da.forEach(function(b2) {
            "selectionchange" !== b2 && (mf.has(b2) || qf(b2, false, a), qf(b2, true, a));
          });
          var b = 9 === a.nodeType ? a : a.ownerDocument;
          null === b || b[rf] || (b[rf] = true, qf("selectionchange", false, b));
        }
      }
      function pf(a, b, c, d) {
        switch (jd(b)) {
          case 1:
            var e = ed;
            break;
          case 4:
            e = gd;
            break;
          default:
            e = fd;
        }
        c = e.bind(null, b, c, a);
        e = void 0;
        !Lb || "touchstart" !== b && "touchmove" !== b && "wheel" !== b || (e = true);
        d ? void 0 !== e ? a.addEventListener(b, c, { capture: true, passive: e }) : a.addEventListener(b, c, true) : void 0 !== e ? a.addEventListener(b, c, { passive: e }) : a.addEventListener(b, c, false);
      }
      function hd(a, b, c, d, e) {
        var f = d;
        if (0 === (b & 1) && 0 === (b & 2) && null !== d) a: for (; ; ) {
          if (null === d) return;
          var g = d.tag;
          if (3 === g || 4 === g) {
            var h = d.stateNode.containerInfo;
            if (h === e || 8 === h.nodeType && h.parentNode === e) break;
            if (4 === g) for (g = d.return; null !== g; ) {
              var k = g.tag;
              if (3 === k || 4 === k) {
                if (k = g.stateNode.containerInfo, k === e || 8 === k.nodeType && k.parentNode === e) return;
              }
              g = g.return;
            }
            for (; null !== h; ) {
              g = Wc(h);
              if (null === g) return;
              k = g.tag;
              if (5 === k || 6 === k) {
                d = f = g;
                continue a;
              }
              h = h.parentNode;
            }
          }
          d = d.return;
        }
        Jb(function() {
          var d2 = f, e2 = xb(c), g2 = [];
          a: {
            var h2 = df.get(a);
            if (void 0 !== h2) {
              var k2 = td, n = a;
              switch (a) {
                case "keypress":
                  if (0 === od(c)) break a;
                case "keydown":
                case "keyup":
                  k2 = Rd;
                  break;
                case "focusin":
                  n = "focus";
                  k2 = Fd;
                  break;
                case "focusout":
                  n = "blur";
                  k2 = Fd;
                  break;
                case "beforeblur":
                case "afterblur":
                  k2 = Fd;
                  break;
                case "click":
                  if (2 === c.button) break a;
                case "auxclick":
                case "dblclick":
                case "mousedown":
                case "mousemove":
                case "mouseup":
                case "mouseout":
                case "mouseover":
                case "contextmenu":
                  k2 = Bd;
                  break;
                case "drag":
                case "dragend":
                case "dragenter":
                case "dragexit":
                case "dragleave":
                case "dragover":
                case "dragstart":
                case "drop":
                  k2 = Dd;
                  break;
                case "touchcancel":
                case "touchend":
                case "touchmove":
                case "touchstart":
                  k2 = Vd;
                  break;
                case $e:
                case af:
                case bf:
                  k2 = Hd;
                  break;
                case cf:
                  k2 = Xd;
                  break;
                case "scroll":
                  k2 = vd;
                  break;
                case "wheel":
                  k2 = Zd;
                  break;
                case "copy":
                case "cut":
                case "paste":
                  k2 = Jd;
                  break;
                case "gotpointercapture":
                case "lostpointercapture":
                case "pointercancel":
                case "pointerdown":
                case "pointermove":
                case "pointerout":
                case "pointerover":
                case "pointerup":
                  k2 = Td;
              }
              var t = 0 !== (b & 4), J = !t && "scroll" === a, x = t ? null !== h2 ? h2 + "Capture" : null : h2;
              t = [];
              for (var w = d2, u; null !== w; ) {
                u = w;
                var F = u.stateNode;
                5 === u.tag && null !== F && (u = F, null !== x && (F = Kb(w, x), null != F && t.push(tf(w, F, u))));
                if (J) break;
                w = w.return;
              }
              0 < t.length && (h2 = new k2(h2, n, null, c, e2), g2.push({ event: h2, listeners: t }));
            }
          }
          if (0 === (b & 7)) {
            a: {
              h2 = "mouseover" === a || "pointerover" === a;
              k2 = "mouseout" === a || "pointerout" === a;
              if (h2 && c !== wb && (n = c.relatedTarget || c.fromElement) && (Wc(n) || n[uf])) break a;
              if (k2 || h2) {
                h2 = e2.window === e2 ? e2 : (h2 = e2.ownerDocument) ? h2.defaultView || h2.parentWindow : window;
                if (k2) {
                  if (n = c.relatedTarget || c.toElement, k2 = d2, n = n ? Wc(n) : null, null !== n && (J = Vb(n), n !== J || 5 !== n.tag && 6 !== n.tag)) n = null;
                } else k2 = null, n = d2;
                if (k2 !== n) {
                  t = Bd;
                  F = "onMouseLeave";
                  x = "onMouseEnter";
                  w = "mouse";
                  if ("pointerout" === a || "pointerover" === a) t = Td, F = "onPointerLeave", x = "onPointerEnter", w = "pointer";
                  J = null == k2 ? h2 : ue(k2);
                  u = null == n ? h2 : ue(n);
                  h2 = new t(F, w + "leave", k2, c, e2);
                  h2.target = J;
                  h2.relatedTarget = u;
                  F = null;
                  Wc(e2) === d2 && (t = new t(x, w + "enter", n, c, e2), t.target = u, t.relatedTarget = J, F = t);
                  J = F;
                  if (k2 && n) b: {
                    t = k2;
                    x = n;
                    w = 0;
                    for (u = t; u; u = vf(u)) w++;
                    u = 0;
                    for (F = x; F; F = vf(F)) u++;
                    for (; 0 < w - u; ) t = vf(t), w--;
                    for (; 0 < u - w; ) x = vf(x), u--;
                    for (; w--; ) {
                      if (t === x || null !== x && t === x.alternate) break b;
                      t = vf(t);
                      x = vf(x);
                    }
                    t = null;
                  }
                  else t = null;
                  null !== k2 && wf(g2, h2, k2, t, false);
                  null !== n && null !== J && wf(g2, J, n, t, true);
                }
              }
            }
            a: {
              h2 = d2 ? ue(d2) : window;
              k2 = h2.nodeName && h2.nodeName.toLowerCase();
              if ("select" === k2 || "input" === k2 && "file" === h2.type) var na = ve;
              else if (me(h2)) if (we) na = Fe;
              else {
                na = De;
                var xa = Ce;
              }
              else (k2 = h2.nodeName) && "input" === k2.toLowerCase() && ("checkbox" === h2.type || "radio" === h2.type) && (na = Ee);
              if (na && (na = na(a, d2))) {
                ne(g2, na, c, e2);
                break a;
              }
              xa && xa(a, h2, d2);
              "focusout" === a && (xa = h2._wrapperState) && xa.controlled && "number" === h2.type && cb(h2, "number", h2.value);
            }
            xa = d2 ? ue(d2) : window;
            switch (a) {
              case "focusin":
                if (me(xa) || "true" === xa.contentEditable) Qe = xa, Re = d2, Se = null;
                break;
              case "focusout":
                Se = Re = Qe = null;
                break;
              case "mousedown":
                Te = true;
                break;
              case "contextmenu":
              case "mouseup":
              case "dragend":
                Te = false;
                Ue(g2, c, e2);
                break;
              case "selectionchange":
                if (Pe) break;
              case "keydown":
              case "keyup":
                Ue(g2, c, e2);
            }
            var $a;
            if (ae) b: {
              switch (a) {
                case "compositionstart":
                  var ba = "onCompositionStart";
                  break b;
                case "compositionend":
                  ba = "onCompositionEnd";
                  break b;
                case "compositionupdate":
                  ba = "onCompositionUpdate";
                  break b;
              }
              ba = void 0;
            }
            else ie ? ge(a, c) && (ba = "onCompositionEnd") : "keydown" === a && 229 === c.keyCode && (ba = "onCompositionStart");
            ba && (de && "ko" !== c.locale && (ie || "onCompositionStart" !== ba ? "onCompositionEnd" === ba && ie && ($a = nd()) : (kd = e2, ld = "value" in kd ? kd.value : kd.textContent, ie = true)), xa = oe(d2, ba), 0 < xa.length && (ba = new Ld(ba, a, null, c, e2), g2.push({ event: ba, listeners: xa }), $a ? ba.data = $a : ($a = he(c), null !== $a && (ba.data = $a))));
            if ($a = ce ? je(a, c) : ke(a, c)) d2 = oe(d2, "onBeforeInput"), 0 < d2.length && (e2 = new Ld("onBeforeInput", "beforeinput", null, c, e2), g2.push({ event: e2, listeners: d2 }), e2.data = $a);
          }
          se(g2, b);
        });
      }
      function tf(a, b, c) {
        return { instance: a, listener: b, currentTarget: c };
      }
      function oe(a, b) {
        for (var c = b + "Capture", d = []; null !== a; ) {
          var e = a, f = e.stateNode;
          5 === e.tag && null !== f && (e = f, f = Kb(a, c), null != f && d.unshift(tf(a, f, e)), f = Kb(a, b), null != f && d.push(tf(a, f, e)));
          a = a.return;
        }
        return d;
      }
      function vf(a) {
        if (null === a) return null;
        do
          a = a.return;
        while (a && 5 !== a.tag);
        return a ? a : null;
      }
      function wf(a, b, c, d, e) {
        for (var f = b._reactName, g = []; null !== c && c !== d; ) {
          var h = c, k = h.alternate, l = h.stateNode;
          if (null !== k && k === d) break;
          5 === h.tag && null !== l && (h = l, e ? (k = Kb(c, f), null != k && g.unshift(tf(c, k, h))) : e || (k = Kb(c, f), null != k && g.push(tf(c, k, h))));
          c = c.return;
        }
        0 !== g.length && a.push({ event: b, listeners: g });
      }
      var xf = /\r\n?/g, yf = /\u0000|\uFFFD/g;
      function zf(a) {
        return ("string" === typeof a ? a : "" + a).replace(xf, "\n").replace(yf, "");
      }
      function Af(a, b, c) {
        b = zf(b);
        if (zf(a) !== b && c) throw Error(p(425));
      }
      function Bf() {
      }
      var Cf = null, Df = null;
      function Ef(a, b) {
        return "textarea" === a || "noscript" === a || "string" === typeof b.children || "number" === typeof b.children || "object" === typeof b.dangerouslySetInnerHTML && null !== b.dangerouslySetInnerHTML && null != b.dangerouslySetInnerHTML.__html;
      }
      var Ff = "function" === typeof setTimeout ? setTimeout : void 0, Gf = "function" === typeof clearTimeout ? clearTimeout : void 0, Hf = "function" === typeof Promise ? Promise : void 0, Jf = "function" === typeof queueMicrotask ? queueMicrotask : "undefined" !== typeof Hf ? function(a) {
        return Hf.resolve(null).then(a).catch(If);
      } : Ff;
      function If(a) {
        setTimeout(function() {
          throw a;
        });
      }
      function Kf(a, b) {
        var c = b, d = 0;
        do {
          var e = c.nextSibling;
          a.removeChild(c);
          if (e && 8 === e.nodeType) if (c = e.data, "/$" === c) {
            if (0 === d) {
              a.removeChild(e);
              bd(b);
              return;
            }
            d--;
          } else "$" !== c && "$?" !== c && "$!" !== c || d++;
          c = e;
        } while (c);
        bd(b);
      }
      function Lf(a) {
        for (; null != a; a = a.nextSibling) {
          var b = a.nodeType;
          if (1 === b || 3 === b) break;
          if (8 === b) {
            b = a.data;
            if ("$" === b || "$!" === b || "$?" === b) break;
            if ("/$" === b) return null;
          }
        }
        return a;
      }
      function Mf(a) {
        a = a.previousSibling;
        for (var b = 0; a; ) {
          if (8 === a.nodeType) {
            var c = a.data;
            if ("$" === c || "$!" === c || "$?" === c) {
              if (0 === b) return a;
              b--;
            } else "/$" === c && b++;
          }
          a = a.previousSibling;
        }
        return null;
      }
      var Nf = Math.random().toString(36).slice(2), Of = "__reactFiber$" + Nf, Pf = "__reactProps$" + Nf, uf = "__reactContainer$" + Nf, of = "__reactEvents$" + Nf, Qf = "__reactListeners$" + Nf, Rf = "__reactHandles$" + Nf;
      function Wc(a) {
        var b = a[Of];
        if (b) return b;
        for (var c = a.parentNode; c; ) {
          if (b = c[uf] || c[Of]) {
            c = b.alternate;
            if (null !== b.child || null !== c && null !== c.child) for (a = Mf(a); null !== a; ) {
              if (c = a[Of]) return c;
              a = Mf(a);
            }
            return b;
          }
          a = c;
          c = a.parentNode;
        }
        return null;
      }
      function Cb(a) {
        a = a[Of] || a[uf];
        return !a || 5 !== a.tag && 6 !== a.tag && 13 !== a.tag && 3 !== a.tag ? null : a;
      }
      function ue(a) {
        if (5 === a.tag || 6 === a.tag) return a.stateNode;
        throw Error(p(33));
      }
      function Db(a) {
        return a[Pf] || null;
      }
      var Sf = [], Tf = -1;
      function Uf(a) {
        return { current: a };
      }
      function E(a) {
        0 > Tf || (a.current = Sf[Tf], Sf[Tf] = null, Tf--);
      }
      function G(a, b) {
        Tf++;
        Sf[Tf] = a.current;
        a.current = b;
      }
      var Vf = {}, H = Uf(Vf), Wf = Uf(false), Xf = Vf;
      function Yf(a, b) {
        var c = a.type.contextTypes;
        if (!c) return Vf;
        var d = a.stateNode;
        if (d && d.__reactInternalMemoizedUnmaskedChildContext === b) return d.__reactInternalMemoizedMaskedChildContext;
        var e = {}, f;
        for (f in c) e[f] = b[f];
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = b, a.__reactInternalMemoizedMaskedChildContext = e);
        return e;
      }
      function Zf(a) {
        a = a.childContextTypes;
        return null !== a && void 0 !== a;
      }
      function $f() {
        E(Wf);
        E(H);
      }
      function ag(a, b, c) {
        if (H.current !== Vf) throw Error(p(168));
        G(H, b);
        G(Wf, c);
      }
      function bg(a, b, c) {
        var d = a.stateNode;
        b = b.childContextTypes;
        if ("function" !== typeof d.getChildContext) return c;
        d = d.getChildContext();
        for (var e in d) if (!(e in b)) throw Error(p(108, Ra(a) || "Unknown", e));
        return A({}, c, d);
      }
      function cg(a) {
        a = (a = a.stateNode) && a.__reactInternalMemoizedMergedChildContext || Vf;
        Xf = H.current;
        G(H, a);
        G(Wf, Wf.current);
        return true;
      }
      function dg(a, b, c) {
        var d = a.stateNode;
        if (!d) throw Error(p(169));
        c ? (a = bg(a, b, Xf), d.__reactInternalMemoizedMergedChildContext = a, E(Wf), E(H), G(H, a)) : E(Wf);
        G(Wf, c);
      }
      var eg = null, fg = false, gg = false;
      function hg(a) {
        null === eg ? eg = [a] : eg.push(a);
      }
      function ig(a) {
        fg = true;
        hg(a);
      }
      function jg() {
        if (!gg && null !== eg) {
          gg = true;
          var a = 0, b = C;
          try {
            var c = eg;
            for (C = 1; a < c.length; a++) {
              var d = c[a];
              do
                d = d(true);
              while (null !== d);
            }
            eg = null;
            fg = false;
          } catch (e) {
            throw null !== eg && (eg = eg.slice(a + 1)), ac(fc, jg), e;
          } finally {
            C = b, gg = false;
          }
        }
        return null;
      }
      var kg = [], lg = 0, mg = null, ng = 0, og = [], pg = 0, qg = null, rg = 1, sg = "";
      function tg(a, b) {
        kg[lg++] = ng;
        kg[lg++] = mg;
        mg = a;
        ng = b;
      }
      function ug(a, b, c) {
        og[pg++] = rg;
        og[pg++] = sg;
        og[pg++] = qg;
        qg = a;
        var d = rg;
        a = sg;
        var e = 32 - oc(d) - 1;
        d &= ~(1 << e);
        c += 1;
        var f = 32 - oc(b) + e;
        if (30 < f) {
          var g = e - e % 5;
          f = (d & (1 << g) - 1).toString(32);
          d >>= g;
          e -= g;
          rg = 1 << 32 - oc(b) + e | c << e | d;
          sg = f + a;
        } else rg = 1 << f | c << e | d, sg = a;
      }
      function vg(a) {
        null !== a.return && (tg(a, 1), ug(a, 1, 0));
      }
      function wg(a) {
        for (; a === mg; ) mg = kg[--lg], kg[lg] = null, ng = kg[--lg], kg[lg] = null;
        for (; a === qg; ) qg = og[--pg], og[pg] = null, sg = og[--pg], og[pg] = null, rg = og[--pg], og[pg] = null;
      }
      var xg = null, yg = null, I = false, zg = null;
      function Ag(a, b) {
        var c = Bg(5, null, null, 0);
        c.elementType = "DELETED";
        c.stateNode = b;
        c.return = a;
        b = a.deletions;
        null === b ? (a.deletions = [c], a.flags |= 16) : b.push(c);
      }
      function Cg(a, b) {
        switch (a.tag) {
          case 5:
            var c = a.type;
            b = 1 !== b.nodeType || c.toLowerCase() !== b.nodeName.toLowerCase() ? null : b;
            return null !== b ? (a.stateNode = b, xg = a, yg = Lf(b.firstChild), true) : false;
          case 6:
            return b = "" === a.pendingProps || 3 !== b.nodeType ? null : b, null !== b ? (a.stateNode = b, xg = a, yg = null, true) : false;
          case 13:
            return b = 8 !== b.nodeType ? null : b, null !== b ? (c = null !== qg ? { id: rg, overflow: sg } : null, a.memoizedState = { dehydrated: b, treeContext: c, retryLane: 1073741824 }, c = Bg(18, null, null, 0), c.stateNode = b, c.return = a, a.child = c, xg = a, yg = null, true) : false;
          default:
            return false;
        }
      }
      function Dg(a) {
        return 0 !== (a.mode & 1) && 0 === (a.flags & 128);
      }
      function Eg(a) {
        if (I) {
          var b = yg;
          if (b) {
            var c = b;
            if (!Cg(a, b)) {
              if (Dg(a)) throw Error(p(418));
              b = Lf(c.nextSibling);
              var d = xg;
              b && Cg(a, b) ? Ag(d, c) : (a.flags = a.flags & -4097 | 2, I = false, xg = a);
            }
          } else {
            if (Dg(a)) throw Error(p(418));
            a.flags = a.flags & -4097 | 2;
            I = false;
            xg = a;
          }
        }
      }
      function Fg(a) {
        for (a = a.return; null !== a && 5 !== a.tag && 3 !== a.tag && 13 !== a.tag; ) a = a.return;
        xg = a;
      }
      function Gg(a) {
        if (a !== xg) return false;
        if (!I) return Fg(a), I = true, false;
        var b;
        (b = 3 !== a.tag) && !(b = 5 !== a.tag) && (b = a.type, b = "head" !== b && "body" !== b && !Ef(a.type, a.memoizedProps));
        if (b && (b = yg)) {
          if (Dg(a)) throw Hg(), Error(p(418));
          for (; b; ) Ag(a, b), b = Lf(b.nextSibling);
        }
        Fg(a);
        if (13 === a.tag) {
          a = a.memoizedState;
          a = null !== a ? a.dehydrated : null;
          if (!a) throw Error(p(317));
          a: {
            a = a.nextSibling;
            for (b = 0; a; ) {
              if (8 === a.nodeType) {
                var c = a.data;
                if ("/$" === c) {
                  if (0 === b) {
                    yg = Lf(a.nextSibling);
                    break a;
                  }
                  b--;
                } else "$" !== c && "$!" !== c && "$?" !== c || b++;
              }
              a = a.nextSibling;
            }
            yg = null;
          }
        } else yg = xg ? Lf(a.stateNode.nextSibling) : null;
        return true;
      }
      function Hg() {
        for (var a = yg; a; ) a = Lf(a.nextSibling);
      }
      function Ig() {
        yg = xg = null;
        I = false;
      }
      function Jg(a) {
        null === zg ? zg = [a] : zg.push(a);
      }
      var Kg = ua.ReactCurrentBatchConfig;
      function Lg(a, b, c) {
        a = c.ref;
        if (null !== a && "function" !== typeof a && "object" !== typeof a) {
          if (c._owner) {
            c = c._owner;
            if (c) {
              if (1 !== c.tag) throw Error(p(309));
              var d = c.stateNode;
            }
            if (!d) throw Error(p(147, a));
            var e = d, f = "" + a;
            if (null !== b && null !== b.ref && "function" === typeof b.ref && b.ref._stringRef === f) return b.ref;
            b = function(a2) {
              var b2 = e.refs;
              null === a2 ? delete b2[f] : b2[f] = a2;
            };
            b._stringRef = f;
            return b;
          }
          if ("string" !== typeof a) throw Error(p(284));
          if (!c._owner) throw Error(p(290, a));
        }
        return a;
      }
      function Mg(a, b) {
        a = Object.prototype.toString.call(b);
        throw Error(p(31, "[object Object]" === a ? "object with keys {" + Object.keys(b).join(", ") + "}" : a));
      }
      function Ng(a) {
        var b = a._init;
        return b(a._payload);
      }
      function Og(a) {
        function b(b2, c2) {
          if (a) {
            var d2 = b2.deletions;
            null === d2 ? (b2.deletions = [c2], b2.flags |= 16) : d2.push(c2);
          }
        }
        function c(c2, d2) {
          if (!a) return null;
          for (; null !== d2; ) b(c2, d2), d2 = d2.sibling;
          return null;
        }
        function d(a2, b2) {
          for (a2 = /* @__PURE__ */ new Map(); null !== b2; ) null !== b2.key ? a2.set(b2.key, b2) : a2.set(b2.index, b2), b2 = b2.sibling;
          return a2;
        }
        function e(a2, b2) {
          a2 = Pg(a2, b2);
          a2.index = 0;
          a2.sibling = null;
          return a2;
        }
        function f(b2, c2, d2) {
          b2.index = d2;
          if (!a) return b2.flags |= 1048576, c2;
          d2 = b2.alternate;
          if (null !== d2) return d2 = d2.index, d2 < c2 ? (b2.flags |= 2, c2) : d2;
          b2.flags |= 2;
          return c2;
        }
        function g(b2) {
          a && null === b2.alternate && (b2.flags |= 2);
          return b2;
        }
        function h(a2, b2, c2, d2) {
          if (null === b2 || 6 !== b2.tag) return b2 = Qg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function k(a2, b2, c2, d2) {
          var f2 = c2.type;
          if (f2 === ya) return m(a2, b2, c2.props.children, d2, c2.key);
          if (null !== b2 && (b2.elementType === f2 || "object" === typeof f2 && null !== f2 && f2.$$typeof === Ha && Ng(f2) === b2.type)) return d2 = e(b2, c2.props), d2.ref = Lg(a2, b2, c2), d2.return = a2, d2;
          d2 = Rg(c2.type, c2.key, c2.props, null, a2.mode, d2);
          d2.ref = Lg(a2, b2, c2);
          d2.return = a2;
          return d2;
        }
        function l(a2, b2, c2, d2) {
          if (null === b2 || 4 !== b2.tag || b2.stateNode.containerInfo !== c2.containerInfo || b2.stateNode.implementation !== c2.implementation) return b2 = Sg(c2, a2.mode, d2), b2.return = a2, b2;
          b2 = e(b2, c2.children || []);
          b2.return = a2;
          return b2;
        }
        function m(a2, b2, c2, d2, f2) {
          if (null === b2 || 7 !== b2.tag) return b2 = Tg(c2, a2.mode, d2, f2), b2.return = a2, b2;
          b2 = e(b2, c2);
          b2.return = a2;
          return b2;
        }
        function q(a2, b2, c2) {
          if ("string" === typeof b2 && "" !== b2 || "number" === typeof b2) return b2 = Qg("" + b2, a2.mode, c2), b2.return = a2, b2;
          if ("object" === typeof b2 && null !== b2) {
            switch (b2.$$typeof) {
              case va:
                return c2 = Rg(b2.type, b2.key, b2.props, null, a2.mode, c2), c2.ref = Lg(a2, null, b2), c2.return = a2, c2;
              case wa:
                return b2 = Sg(b2, a2.mode, c2), b2.return = a2, b2;
              case Ha:
                var d2 = b2._init;
                return q(a2, d2(b2._payload), c2);
            }
            if (eb(b2) || Ka(b2)) return b2 = Tg(b2, a2.mode, c2, null), b2.return = a2, b2;
            Mg(a2, b2);
          }
          return null;
        }
        function r(a2, b2, c2, d2) {
          var e2 = null !== b2 ? b2.key : null;
          if ("string" === typeof c2 && "" !== c2 || "number" === typeof c2) return null !== e2 ? null : h(a2, b2, "" + c2, d2);
          if ("object" === typeof c2 && null !== c2) {
            switch (c2.$$typeof) {
              case va:
                return c2.key === e2 ? k(a2, b2, c2, d2) : null;
              case wa:
                return c2.key === e2 ? l(a2, b2, c2, d2) : null;
              case Ha:
                return e2 = c2._init, r(
                  a2,
                  b2,
                  e2(c2._payload),
                  d2
                );
            }
            if (eb(c2) || Ka(c2)) return null !== e2 ? null : m(a2, b2, c2, d2, null);
            Mg(a2, c2);
          }
          return null;
        }
        function y(a2, b2, c2, d2, e2) {
          if ("string" === typeof d2 && "" !== d2 || "number" === typeof d2) return a2 = a2.get(c2) || null, h(b2, a2, "" + d2, e2);
          if ("object" === typeof d2 && null !== d2) {
            switch (d2.$$typeof) {
              case va:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, k(b2, a2, d2, e2);
              case wa:
                return a2 = a2.get(null === d2.key ? c2 : d2.key) || null, l(b2, a2, d2, e2);
              case Ha:
                var f2 = d2._init;
                return y(a2, b2, c2, f2(d2._payload), e2);
            }
            if (eb(d2) || Ka(d2)) return a2 = a2.get(c2) || null, m(b2, a2, d2, e2, null);
            Mg(b2, d2);
          }
          return null;
        }
        function n(e2, g2, h2, k2) {
          for (var l2 = null, m2 = null, u = g2, w = g2 = 0, x = null; null !== u && w < h2.length; w++) {
            u.index > w ? (x = u, u = null) : x = u.sibling;
            var n2 = r(e2, u, h2[w], k2);
            if (null === n2) {
              null === u && (u = x);
              break;
            }
            a && u && null === n2.alternate && b(e2, u);
            g2 = f(n2, g2, w);
            null === m2 ? l2 = n2 : m2.sibling = n2;
            m2 = n2;
            u = x;
          }
          if (w === h2.length) return c(e2, u), I && tg(e2, w), l2;
          if (null === u) {
            for (; w < h2.length; w++) u = q(e2, h2[w], k2), null !== u && (g2 = f(u, g2, w), null === m2 ? l2 = u : m2.sibling = u, m2 = u);
            I && tg(e2, w);
            return l2;
          }
          for (u = d(e2, u); w < h2.length; w++) x = y(u, e2, w, h2[w], k2), null !== x && (a && null !== x.alternate && u.delete(null === x.key ? w : x.key), g2 = f(x, g2, w), null === m2 ? l2 = x : m2.sibling = x, m2 = x);
          a && u.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function t(e2, g2, h2, k2) {
          var l2 = Ka(h2);
          if ("function" !== typeof l2) throw Error(p(150));
          h2 = l2.call(h2);
          if (null == h2) throw Error(p(151));
          for (var u = l2 = null, m2 = g2, w = g2 = 0, x = null, n2 = h2.next(); null !== m2 && !n2.done; w++, n2 = h2.next()) {
            m2.index > w ? (x = m2, m2 = null) : x = m2.sibling;
            var t2 = r(e2, m2, n2.value, k2);
            if (null === t2) {
              null === m2 && (m2 = x);
              break;
            }
            a && m2 && null === t2.alternate && b(e2, m2);
            g2 = f(t2, g2, w);
            null === u ? l2 = t2 : u.sibling = t2;
            u = t2;
            m2 = x;
          }
          if (n2.done) return c(
            e2,
            m2
          ), I && tg(e2, w), l2;
          if (null === m2) {
            for (; !n2.done; w++, n2 = h2.next()) n2 = q(e2, n2.value, k2), null !== n2 && (g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
            I && tg(e2, w);
            return l2;
          }
          for (m2 = d(e2, m2); !n2.done; w++, n2 = h2.next()) n2 = y(m2, e2, w, n2.value, k2), null !== n2 && (a && null !== n2.alternate && m2.delete(null === n2.key ? w : n2.key), g2 = f(n2, g2, w), null === u ? l2 = n2 : u.sibling = n2, u = n2);
          a && m2.forEach(function(a2) {
            return b(e2, a2);
          });
          I && tg(e2, w);
          return l2;
        }
        function J(a2, d2, f2, h2) {
          "object" === typeof f2 && null !== f2 && f2.type === ya && null === f2.key && (f2 = f2.props.children);
          if ("object" === typeof f2 && null !== f2) {
            switch (f2.$$typeof) {
              case va:
                a: {
                  for (var k2 = f2.key, l2 = d2; null !== l2; ) {
                    if (l2.key === k2) {
                      k2 = f2.type;
                      if (k2 === ya) {
                        if (7 === l2.tag) {
                          c(a2, l2.sibling);
                          d2 = e(l2, f2.props.children);
                          d2.return = a2;
                          a2 = d2;
                          break a;
                        }
                      } else if (l2.elementType === k2 || "object" === typeof k2 && null !== k2 && k2.$$typeof === Ha && Ng(k2) === l2.type) {
                        c(a2, l2.sibling);
                        d2 = e(l2, f2.props);
                        d2.ref = Lg(a2, l2, f2);
                        d2.return = a2;
                        a2 = d2;
                        break a;
                      }
                      c(a2, l2);
                      break;
                    } else b(a2, l2);
                    l2 = l2.sibling;
                  }
                  f2.type === ya ? (d2 = Tg(f2.props.children, a2.mode, h2, f2.key), d2.return = a2, a2 = d2) : (h2 = Rg(f2.type, f2.key, f2.props, null, a2.mode, h2), h2.ref = Lg(a2, d2, f2), h2.return = a2, a2 = h2);
                }
                return g(a2);
              case wa:
                a: {
                  for (l2 = f2.key; null !== d2; ) {
                    if (d2.key === l2) if (4 === d2.tag && d2.stateNode.containerInfo === f2.containerInfo && d2.stateNode.implementation === f2.implementation) {
                      c(a2, d2.sibling);
                      d2 = e(d2, f2.children || []);
                      d2.return = a2;
                      a2 = d2;
                      break a;
                    } else {
                      c(a2, d2);
                      break;
                    }
                    else b(a2, d2);
                    d2 = d2.sibling;
                  }
                  d2 = Sg(f2, a2.mode, h2);
                  d2.return = a2;
                  a2 = d2;
                }
                return g(a2);
              case Ha:
                return l2 = f2._init, J(a2, d2, l2(f2._payload), h2);
            }
            if (eb(f2)) return n(a2, d2, f2, h2);
            if (Ka(f2)) return t(a2, d2, f2, h2);
            Mg(a2, f2);
          }
          return "string" === typeof f2 && "" !== f2 || "number" === typeof f2 ? (f2 = "" + f2, null !== d2 && 6 === d2.tag ? (c(a2, d2.sibling), d2 = e(d2, f2), d2.return = a2, a2 = d2) : (c(a2, d2), d2 = Qg(f2, a2.mode, h2), d2.return = a2, a2 = d2), g(a2)) : c(a2, d2);
        }
        return J;
      }
      var Ug = Og(true), Vg = Og(false), Wg = Uf(null), Xg = null, Yg = null, Zg = null;
      function $g() {
        Zg = Yg = Xg = null;
      }
      function ah(a) {
        var b = Wg.current;
        E(Wg);
        a._currentValue = b;
      }
      function bh(a, b, c) {
        for (; null !== a; ) {
          var d = a.alternate;
          (a.childLanes & b) !== b ? (a.childLanes |= b, null !== d && (d.childLanes |= b)) : null !== d && (d.childLanes & b) !== b && (d.childLanes |= b);
          if (a === c) break;
          a = a.return;
        }
      }
      function ch(a, b) {
        Xg = a;
        Zg = Yg = null;
        a = a.dependencies;
        null !== a && null !== a.firstContext && (0 !== (a.lanes & b) && (dh = true), a.firstContext = null);
      }
      function eh(a) {
        var b = a._currentValue;
        if (Zg !== a) if (a = { context: a, memoizedValue: b, next: null }, null === Yg) {
          if (null === Xg) throw Error(p(308));
          Yg = a;
          Xg.dependencies = { lanes: 0, firstContext: a };
        } else Yg = Yg.next = a;
        return b;
      }
      var fh = null;
      function gh(a) {
        null === fh ? fh = [a] : fh.push(a);
      }
      function hh(a, b, c, d) {
        var e = b.interleaved;
        null === e ? (c.next = c, gh(b)) : (c.next = e.next, e.next = c);
        b.interleaved = c;
        return ih(a, d);
      }
      function ih(a, b) {
        a.lanes |= b;
        var c = a.alternate;
        null !== c && (c.lanes |= b);
        c = a;
        for (a = a.return; null !== a; ) a.childLanes |= b, c = a.alternate, null !== c && (c.childLanes |= b), c = a, a = a.return;
        return 3 === c.tag ? c.stateNode : null;
      }
      var jh = false;
      function kh(a) {
        a.updateQueue = { baseState: a.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, interleaved: null, lanes: 0 }, effects: null };
      }
      function lh(a, b) {
        a = a.updateQueue;
        b.updateQueue === a && (b.updateQueue = { baseState: a.baseState, firstBaseUpdate: a.firstBaseUpdate, lastBaseUpdate: a.lastBaseUpdate, shared: a.shared, effects: a.effects });
      }
      function mh(a, b) {
        return { eventTime: a, lane: b, tag: 0, payload: null, callback: null, next: null };
      }
      function nh(a, b, c) {
        var d = a.updateQueue;
        if (null === d) return null;
        d = d.shared;
        if (0 !== (K & 2)) {
          var e = d.pending;
          null === e ? b.next = b : (b.next = e.next, e.next = b);
          d.pending = b;
          return ih(a, c);
        }
        e = d.interleaved;
        null === e ? (b.next = b, gh(d)) : (b.next = e.next, e.next = b);
        d.interleaved = b;
        return ih(a, c);
      }
      function oh(a, b, c) {
        b = b.updateQueue;
        if (null !== b && (b = b.shared, 0 !== (c & 4194240))) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      function ph(a, b) {
        var c = a.updateQueue, d = a.alternate;
        if (null !== d && (d = d.updateQueue, c === d)) {
          var e = null, f = null;
          c = c.firstBaseUpdate;
          if (null !== c) {
            do {
              var g = { eventTime: c.eventTime, lane: c.lane, tag: c.tag, payload: c.payload, callback: c.callback, next: null };
              null === f ? e = f = g : f = f.next = g;
              c = c.next;
            } while (null !== c);
            null === f ? e = f = b : f = f.next = b;
          } else e = f = b;
          c = { baseState: d.baseState, firstBaseUpdate: e, lastBaseUpdate: f, shared: d.shared, effects: d.effects };
          a.updateQueue = c;
          return;
        }
        a = c.lastBaseUpdate;
        null === a ? c.firstBaseUpdate = b : a.next = b;
        c.lastBaseUpdate = b;
      }
      function qh(a, b, c, d) {
        var e = a.updateQueue;
        jh = false;
        var f = e.firstBaseUpdate, g = e.lastBaseUpdate, h = e.shared.pending;
        if (null !== h) {
          e.shared.pending = null;
          var k = h, l = k.next;
          k.next = null;
          null === g ? f = l : g.next = l;
          g = k;
          var m = a.alternate;
          null !== m && (m = m.updateQueue, h = m.lastBaseUpdate, h !== g && (null === h ? m.firstBaseUpdate = l : h.next = l, m.lastBaseUpdate = k));
        }
        if (null !== f) {
          var q = e.baseState;
          g = 0;
          m = l = k = null;
          h = f;
          do {
            var r = h.lane, y = h.eventTime;
            if ((d & r) === r) {
              null !== m && (m = m.next = {
                eventTime: y,
                lane: 0,
                tag: h.tag,
                payload: h.payload,
                callback: h.callback,
                next: null
              });
              a: {
                var n = a, t = h;
                r = b;
                y = c;
                switch (t.tag) {
                  case 1:
                    n = t.payload;
                    if ("function" === typeof n) {
                      q = n.call(y, q, r);
                      break a;
                    }
                    q = n;
                    break a;
                  case 3:
                    n.flags = n.flags & -65537 | 128;
                  case 0:
                    n = t.payload;
                    r = "function" === typeof n ? n.call(y, q, r) : n;
                    if (null === r || void 0 === r) break a;
                    q = A({}, q, r);
                    break a;
                  case 2:
                    jh = true;
                }
              }
              null !== h.callback && 0 !== h.lane && (a.flags |= 64, r = e.effects, null === r ? e.effects = [h] : r.push(h));
            } else y = { eventTime: y, lane: r, tag: h.tag, payload: h.payload, callback: h.callback, next: null }, null === m ? (l = m = y, k = q) : m = m.next = y, g |= r;
            h = h.next;
            if (null === h) if (h = e.shared.pending, null === h) break;
            else r = h, h = r.next, r.next = null, e.lastBaseUpdate = r, e.shared.pending = null;
          } while (1);
          null === m && (k = q);
          e.baseState = k;
          e.firstBaseUpdate = l;
          e.lastBaseUpdate = m;
          b = e.shared.interleaved;
          if (null !== b) {
            e = b;
            do
              g |= e.lane, e = e.next;
            while (e !== b);
          } else null === f && (e.shared.lanes = 0);
          rh |= g;
          a.lanes = g;
          a.memoizedState = q;
        }
      }
      function sh(a, b, c) {
        a = b.effects;
        b.effects = null;
        if (null !== a) for (b = 0; b < a.length; b++) {
          var d = a[b], e = d.callback;
          if (null !== e) {
            d.callback = null;
            d = c;
            if ("function" !== typeof e) throw Error(p(191, e));
            e.call(d);
          }
        }
      }
      var th = {}, uh = Uf(th), vh = Uf(th), wh = Uf(th);
      function xh(a) {
        if (a === th) throw Error(p(174));
        return a;
      }
      function yh(a, b) {
        G(wh, b);
        G(vh, a);
        G(uh, th);
        a = b.nodeType;
        switch (a) {
          case 9:
          case 11:
            b = (b = b.documentElement) ? b.namespaceURI : lb(null, "");
            break;
          default:
            a = 8 === a ? b.parentNode : b, b = a.namespaceURI || null, a = a.tagName, b = lb(b, a);
        }
        E(uh);
        G(uh, b);
      }
      function zh() {
        E(uh);
        E(vh);
        E(wh);
      }
      function Ah(a) {
        xh(wh.current);
        var b = xh(uh.current);
        var c = lb(b, a.type);
        b !== c && (G(vh, a), G(uh, c));
      }
      function Bh(a) {
        vh.current === a && (E(uh), E(vh));
      }
      var L = Uf(0);
      function Ch(a) {
        for (var b = a; null !== b; ) {
          if (13 === b.tag) {
            var c = b.memoizedState;
            if (null !== c && (c = c.dehydrated, null === c || "$?" === c.data || "$!" === c.data)) return b;
          } else if (19 === b.tag && void 0 !== b.memoizedProps.revealOrder) {
            if (0 !== (b.flags & 128)) return b;
          } else if (null !== b.child) {
            b.child.return = b;
            b = b.child;
            continue;
          }
          if (b === a) break;
          for (; null === b.sibling; ) {
            if (null === b.return || b.return === a) return null;
            b = b.return;
          }
          b.sibling.return = b.return;
          b = b.sibling;
        }
        return null;
      }
      var Dh = [];
      function Eh() {
        for (var a = 0; a < Dh.length; a++) Dh[a]._workInProgressVersionPrimary = null;
        Dh.length = 0;
      }
      var Fh = ua.ReactCurrentDispatcher, Gh = ua.ReactCurrentBatchConfig, Hh = 0, M = null, N = null, O = null, Ih = false, Jh = false, Kh = 0, Lh = 0;
      function P() {
        throw Error(p(321));
      }
      function Mh(a, b) {
        if (null === b) return false;
        for (var c = 0; c < b.length && c < a.length; c++) if (!He(a[c], b[c])) return false;
        return true;
      }
      function Nh(a, b, c, d, e, f) {
        Hh = f;
        M = b;
        b.memoizedState = null;
        b.updateQueue = null;
        b.lanes = 0;
        Fh.current = null === a || null === a.memoizedState ? Oh : Ph;
        a = c(d, e);
        if (Jh) {
          f = 0;
          do {
            Jh = false;
            Kh = 0;
            if (25 <= f) throw Error(p(301));
            f += 1;
            O = N = null;
            b.updateQueue = null;
            Fh.current = Qh;
            a = c(d, e);
          } while (Jh);
        }
        Fh.current = Rh;
        b = null !== N && null !== N.next;
        Hh = 0;
        O = N = M = null;
        Ih = false;
        if (b) throw Error(p(300));
        return a;
      }
      function Sh() {
        var a = 0 !== Kh;
        Kh = 0;
        return a;
      }
      function Th() {
        var a = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
        null === O ? M.memoizedState = O = a : O = O.next = a;
        return O;
      }
      function Uh() {
        if (null === N) {
          var a = M.alternate;
          a = null !== a ? a.memoizedState : null;
        } else a = N.next;
        var b = null === O ? M.memoizedState : O.next;
        if (null !== b) O = b, N = a;
        else {
          if (null === a) throw Error(p(310));
          N = a;
          a = { memoizedState: N.memoizedState, baseState: N.baseState, baseQueue: N.baseQueue, queue: N.queue, next: null };
          null === O ? M.memoizedState = O = a : O = O.next = a;
        }
        return O;
      }
      function Vh(a, b) {
        return "function" === typeof b ? b(a) : b;
      }
      function Wh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = N, e = d.baseQueue, f = c.pending;
        if (null !== f) {
          if (null !== e) {
            var g = e.next;
            e.next = f.next;
            f.next = g;
          }
          d.baseQueue = e = f;
          c.pending = null;
        }
        if (null !== e) {
          f = e.next;
          d = d.baseState;
          var h = g = null, k = null, l = f;
          do {
            var m = l.lane;
            if ((Hh & m) === m) null !== k && (k = k.next = { lane: 0, action: l.action, hasEagerState: l.hasEagerState, eagerState: l.eagerState, next: null }), d = l.hasEagerState ? l.eagerState : a(d, l.action);
            else {
              var q = {
                lane: m,
                action: l.action,
                hasEagerState: l.hasEagerState,
                eagerState: l.eagerState,
                next: null
              };
              null === k ? (h = k = q, g = d) : k = k.next = q;
              M.lanes |= m;
              rh |= m;
            }
            l = l.next;
          } while (null !== l && l !== f);
          null === k ? g = d : k.next = h;
          He(d, b.memoizedState) || (dh = true);
          b.memoizedState = d;
          b.baseState = g;
          b.baseQueue = k;
          c.lastRenderedState = d;
        }
        a = c.interleaved;
        if (null !== a) {
          e = a;
          do
            f = e.lane, M.lanes |= f, rh |= f, e = e.next;
          while (e !== a);
        } else null === e && (c.lanes = 0);
        return [b.memoizedState, c.dispatch];
      }
      function Xh(a) {
        var b = Uh(), c = b.queue;
        if (null === c) throw Error(p(311));
        c.lastRenderedReducer = a;
        var d = c.dispatch, e = c.pending, f = b.memoizedState;
        if (null !== e) {
          c.pending = null;
          var g = e = e.next;
          do
            f = a(f, g.action), g = g.next;
          while (g !== e);
          He(f, b.memoizedState) || (dh = true);
          b.memoizedState = f;
          null === b.baseQueue && (b.baseState = f);
          c.lastRenderedState = f;
        }
        return [f, d];
      }
      function Yh() {
      }
      function Zh(a, b) {
        var c = M, d = Uh(), e = b(), f = !He(d.memoizedState, e);
        f && (d.memoizedState = e, dh = true);
        d = d.queue;
        $h(ai.bind(null, c, d, a), [a]);
        if (d.getSnapshot !== b || f || null !== O && O.memoizedState.tag & 1) {
          c.flags |= 2048;
          bi(9, ci.bind(null, c, d, e, b), void 0, null);
          if (null === Q) throw Error(p(349));
          0 !== (Hh & 30) || di(c, b, e);
        }
        return e;
      }
      function di(a, b, c) {
        a.flags |= 16384;
        a = { getSnapshot: b, value: c };
        b = M.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.stores = [a]) : (c = b.stores, null === c ? b.stores = [a] : c.push(a));
      }
      function ci(a, b, c, d) {
        b.value = c;
        b.getSnapshot = d;
        ei(b) && fi(a);
      }
      function ai(a, b, c) {
        return c(function() {
          ei(b) && fi(a);
        });
      }
      function ei(a) {
        var b = a.getSnapshot;
        a = a.value;
        try {
          var c = b();
          return !He(a, c);
        } catch (d) {
          return true;
        }
      }
      function fi(a) {
        var b = ih(a, 1);
        null !== b && gi(b, a, 1, -1);
      }
      function hi(a) {
        var b = Th();
        "function" === typeof a && (a = a());
        b.memoizedState = b.baseState = a;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: Vh, lastRenderedState: a };
        b.queue = a;
        a = a.dispatch = ii.bind(null, M, a);
        return [b.memoizedState, a];
      }
      function bi(a, b, c, d) {
        a = { tag: a, create: b, destroy: c, deps: d, next: null };
        b = M.updateQueue;
        null === b ? (b = { lastEffect: null, stores: null }, M.updateQueue = b, b.lastEffect = a.next = a) : (c = b.lastEffect, null === c ? b.lastEffect = a.next = a : (d = c.next, c.next = a, a.next = d, b.lastEffect = a));
        return a;
      }
      function ji() {
        return Uh().memoizedState;
      }
      function ki(a, b, c, d) {
        var e = Th();
        M.flags |= a;
        e.memoizedState = bi(1 | b, c, void 0, void 0 === d ? null : d);
      }
      function li(a, b, c, d) {
        var e = Uh();
        d = void 0 === d ? null : d;
        var f = void 0;
        if (null !== N) {
          var g = N.memoizedState;
          f = g.destroy;
          if (null !== d && Mh(d, g.deps)) {
            e.memoizedState = bi(b, c, f, d);
            return;
          }
        }
        M.flags |= a;
        e.memoizedState = bi(1 | b, c, f, d);
      }
      function mi(a, b) {
        return ki(8390656, 8, a, b);
      }
      function $h(a, b) {
        return li(2048, 8, a, b);
      }
      function ni(a, b) {
        return li(4, 2, a, b);
      }
      function oi(a, b) {
        return li(4, 4, a, b);
      }
      function pi(a, b) {
        if ("function" === typeof b) return a = a(), b(a), function() {
          b(null);
        };
        if (null !== b && void 0 !== b) return a = a(), b.current = a, function() {
          b.current = null;
        };
      }
      function qi(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return li(4, 4, pi.bind(null, b, a), c);
      }
      function ri() {
      }
      function si(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        c.memoizedState = [a, b];
        return a;
      }
      function ti(a, b) {
        var c = Uh();
        b = void 0 === b ? null : b;
        var d = c.memoizedState;
        if (null !== d && null !== b && Mh(b, d[1])) return d[0];
        a = a();
        c.memoizedState = [a, b];
        return a;
      }
      function ui(a, b, c) {
        if (0 === (Hh & 21)) return a.baseState && (a.baseState = false, dh = true), a.memoizedState = c;
        He(c, b) || (c = yc(), M.lanes |= c, rh |= c, a.baseState = true);
        return b;
      }
      function vi(a, b) {
        var c = C;
        C = 0 !== c && 4 > c ? c : 4;
        a(true);
        var d = Gh.transition;
        Gh.transition = {};
        try {
          a(false), b();
        } finally {
          C = c, Gh.transition = d;
        }
      }
      function wi() {
        return Uh().memoizedState;
      }
      function xi(a, b, c) {
        var d = yi(a);
        c = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, c);
        else if (c = hh(a, b, c, d), null !== c) {
          var e = R();
          gi(c, a, d, e);
          Bi(c, b, d);
        }
      }
      function ii(a, b, c) {
        var d = yi(a), e = { lane: d, action: c, hasEagerState: false, eagerState: null, next: null };
        if (zi(a)) Ai(b, e);
        else {
          var f = a.alternate;
          if (0 === a.lanes && (null === f || 0 === f.lanes) && (f = b.lastRenderedReducer, null !== f)) try {
            var g = b.lastRenderedState, h = f(g, c);
            e.hasEagerState = true;
            e.eagerState = h;
            if (He(h, g)) {
              var k = b.interleaved;
              null === k ? (e.next = e, gh(b)) : (e.next = k.next, k.next = e);
              b.interleaved = e;
              return;
            }
          } catch (l) {
          } finally {
          }
          c = hh(a, b, e, d);
          null !== c && (e = R(), gi(c, a, d, e), Bi(c, b, d));
        }
      }
      function zi(a) {
        var b = a.alternate;
        return a === M || null !== b && b === M;
      }
      function Ai(a, b) {
        Jh = Ih = true;
        var c = a.pending;
        null === c ? b.next = b : (b.next = c.next, c.next = b);
        a.pending = b;
      }
      function Bi(a, b, c) {
        if (0 !== (c & 4194240)) {
          var d = b.lanes;
          d &= a.pendingLanes;
          c |= d;
          b.lanes = c;
          Cc(a, c);
        }
      }
      var Rh = { readContext: eh, useCallback: P, useContext: P, useEffect: P, useImperativeHandle: P, useInsertionEffect: P, useLayoutEffect: P, useMemo: P, useReducer: P, useRef: P, useState: P, useDebugValue: P, useDeferredValue: P, useTransition: P, useMutableSource: P, useSyncExternalStore: P, useId: P, unstable_isNewReconciler: false }, Oh = { readContext: eh, useCallback: function(a, b) {
        Th().memoizedState = [a, void 0 === b ? null : b];
        return a;
      }, useContext: eh, useEffect: mi, useImperativeHandle: function(a, b, c) {
        c = null !== c && void 0 !== c ? c.concat([a]) : null;
        return ki(
          4194308,
          4,
          pi.bind(null, b, a),
          c
        );
      }, useLayoutEffect: function(a, b) {
        return ki(4194308, 4, a, b);
      }, useInsertionEffect: function(a, b) {
        return ki(4, 2, a, b);
      }, useMemo: function(a, b) {
        var c = Th();
        b = void 0 === b ? null : b;
        a = a();
        c.memoizedState = [a, b];
        return a;
      }, useReducer: function(a, b, c) {
        var d = Th();
        b = void 0 !== c ? c(b) : b;
        d.memoizedState = d.baseState = b;
        a = { pending: null, interleaved: null, lanes: 0, dispatch: null, lastRenderedReducer: a, lastRenderedState: b };
        d.queue = a;
        a = a.dispatch = xi.bind(null, M, a);
        return [d.memoizedState, a];
      }, useRef: function(a) {
        var b = Th();
        a = { current: a };
        return b.memoizedState = a;
      }, useState: hi, useDebugValue: ri, useDeferredValue: function(a) {
        return Th().memoizedState = a;
      }, useTransition: function() {
        var a = hi(false), b = a[0];
        a = vi.bind(null, a[1]);
        Th().memoizedState = a;
        return [b, a];
      }, useMutableSource: function() {
      }, useSyncExternalStore: function(a, b, c) {
        var d = M, e = Th();
        if (I) {
          if (void 0 === c) throw Error(p(407));
          c = c();
        } else {
          c = b();
          if (null === Q) throw Error(p(349));
          0 !== (Hh & 30) || di(d, b, c);
        }
        e.memoizedState = c;
        var f = { value: c, getSnapshot: b };
        e.queue = f;
        mi(ai.bind(
          null,
          d,
          f,
          a
        ), [a]);
        d.flags |= 2048;
        bi(9, ci.bind(null, d, f, c, b), void 0, null);
        return c;
      }, useId: function() {
        var a = Th(), b = Q.identifierPrefix;
        if (I) {
          var c = sg;
          var d = rg;
          c = (d & ~(1 << 32 - oc(d) - 1)).toString(32) + c;
          b = ":" + b + "R" + c;
          c = Kh++;
          0 < c && (b += "H" + c.toString(32));
          b += ":";
        } else c = Lh++, b = ":" + b + "r" + c.toString(32) + ":";
        return a.memoizedState = b;
      }, unstable_isNewReconciler: false }, Ph = {
        readContext: eh,
        useCallback: si,
        useContext: eh,
        useEffect: $h,
        useImperativeHandle: qi,
        useInsertionEffect: ni,
        useLayoutEffect: oi,
        useMemo: ti,
        useReducer: Wh,
        useRef: ji,
        useState: function() {
          return Wh(Vh);
        },
        useDebugValue: ri,
        useDeferredValue: function(a) {
          var b = Uh();
          return ui(b, N.memoizedState, a);
        },
        useTransition: function() {
          var a = Wh(Vh)[0], b = Uh().memoizedState;
          return [a, b];
        },
        useMutableSource: Yh,
        useSyncExternalStore: Zh,
        useId: wi,
        unstable_isNewReconciler: false
      }, Qh = { readContext: eh, useCallback: si, useContext: eh, useEffect: $h, useImperativeHandle: qi, useInsertionEffect: ni, useLayoutEffect: oi, useMemo: ti, useReducer: Xh, useRef: ji, useState: function() {
        return Xh(Vh);
      }, useDebugValue: ri, useDeferredValue: function(a) {
        var b = Uh();
        return null === N ? b.memoizedState = a : ui(b, N.memoizedState, a);
      }, useTransition: function() {
        var a = Xh(Vh)[0], b = Uh().memoizedState;
        return [a, b];
      }, useMutableSource: Yh, useSyncExternalStore: Zh, useId: wi, unstable_isNewReconciler: false };
      function Ci(a, b) {
        if (a && a.defaultProps) {
          b = A({}, b);
          a = a.defaultProps;
          for (var c in a) void 0 === b[c] && (b[c] = a[c]);
          return b;
        }
        return b;
      }
      function Di(a, b, c, d) {
        b = a.memoizedState;
        c = c(d, b);
        c = null === c || void 0 === c ? b : A({}, b, c);
        a.memoizedState = c;
        0 === a.lanes && (a.updateQueue.baseState = c);
      }
      var Ei = { isMounted: function(a) {
        return (a = a._reactInternals) ? Vb(a) === a : false;
      }, enqueueSetState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueReplaceState: function(a, b, c) {
        a = a._reactInternals;
        var d = R(), e = yi(a), f = mh(d, e);
        f.tag = 1;
        f.payload = b;
        void 0 !== c && null !== c && (f.callback = c);
        b = nh(a, f, e);
        null !== b && (gi(b, a, e, d), oh(b, a, e));
      }, enqueueForceUpdate: function(a, b) {
        a = a._reactInternals;
        var c = R(), d = yi(a), e = mh(c, d);
        e.tag = 2;
        void 0 !== b && null !== b && (e.callback = b);
        b = nh(a, e, d);
        null !== b && (gi(b, a, d, c), oh(b, a, d));
      } };
      function Fi(a, b, c, d, e, f, g) {
        a = a.stateNode;
        return "function" === typeof a.shouldComponentUpdate ? a.shouldComponentUpdate(d, f, g) : b.prototype && b.prototype.isPureReactComponent ? !Ie(c, d) || !Ie(e, f) : true;
      }
      function Gi(a, b, c) {
        var d = false, e = Vf;
        var f = b.contextType;
        "object" === typeof f && null !== f ? f = eh(f) : (e = Zf(b) ? Xf : H.current, d = b.contextTypes, f = (d = null !== d && void 0 !== d) ? Yf(a, e) : Vf);
        b = new b(c, f);
        a.memoizedState = null !== b.state && void 0 !== b.state ? b.state : null;
        b.updater = Ei;
        a.stateNode = b;
        b._reactInternals = a;
        d && (a = a.stateNode, a.__reactInternalMemoizedUnmaskedChildContext = e, a.__reactInternalMemoizedMaskedChildContext = f);
        return b;
      }
      function Hi(a, b, c, d) {
        a = b.state;
        "function" === typeof b.componentWillReceiveProps && b.componentWillReceiveProps(c, d);
        "function" === typeof b.UNSAFE_componentWillReceiveProps && b.UNSAFE_componentWillReceiveProps(c, d);
        b.state !== a && Ei.enqueueReplaceState(b, b.state, null);
      }
      function Ii(a, b, c, d) {
        var e = a.stateNode;
        e.props = c;
        e.state = a.memoizedState;
        e.refs = {};
        kh(a);
        var f = b.contextType;
        "object" === typeof f && null !== f ? e.context = eh(f) : (f = Zf(b) ? Xf : H.current, e.context = Yf(a, f));
        e.state = a.memoizedState;
        f = b.getDerivedStateFromProps;
        "function" === typeof f && (Di(a, b, f, c), e.state = a.memoizedState);
        "function" === typeof b.getDerivedStateFromProps || "function" === typeof e.getSnapshotBeforeUpdate || "function" !== typeof e.UNSAFE_componentWillMount && "function" !== typeof e.componentWillMount || (b = e.state, "function" === typeof e.componentWillMount && e.componentWillMount(), "function" === typeof e.UNSAFE_componentWillMount && e.UNSAFE_componentWillMount(), b !== e.state && Ei.enqueueReplaceState(e, e.state, null), qh(a, c, e, d), e.state = a.memoizedState);
        "function" === typeof e.componentDidMount && (a.flags |= 4194308);
      }
      function Ji(a, b) {
        try {
          var c = "", d = b;
          do
            c += Pa(d), d = d.return;
          while (d);
          var e = c;
        } catch (f) {
          e = "\nError generating stack: " + f.message + "\n" + f.stack;
        }
        return { value: a, source: b, stack: e, digest: null };
      }
      function Ki(a, b, c) {
        return { value: a, source: null, stack: null != c ? c : null, digest: null != b ? b : null };
      }
      function Li(a, b) {
        try {
          console.error(b.value);
        } catch (c) {
          setTimeout(function() {
            throw c;
          });
        }
      }
      var Mi = "function" === typeof WeakMap ? WeakMap : Map;
      function Ni(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        c.payload = { element: null };
        var d = b.value;
        c.callback = function() {
          Oi || (Oi = true, Pi = d);
          Li(a, b);
        };
        return c;
      }
      function Qi(a, b, c) {
        c = mh(-1, c);
        c.tag = 3;
        var d = a.type.getDerivedStateFromError;
        if ("function" === typeof d) {
          var e = b.value;
          c.payload = function() {
            return d(e);
          };
          c.callback = function() {
            Li(a, b);
          };
        }
        var f = a.stateNode;
        null !== f && "function" === typeof f.componentDidCatch && (c.callback = function() {
          Li(a, b);
          "function" !== typeof d && (null === Ri ? Ri = /* @__PURE__ */ new Set([this]) : Ri.add(this));
          var c2 = b.stack;
          this.componentDidCatch(b.value, { componentStack: null !== c2 ? c2 : "" });
        });
        return c;
      }
      function Si(a, b, c) {
        var d = a.pingCache;
        if (null === d) {
          d = a.pingCache = new Mi();
          var e = /* @__PURE__ */ new Set();
          d.set(b, e);
        } else e = d.get(b), void 0 === e && (e = /* @__PURE__ */ new Set(), d.set(b, e));
        e.has(c) || (e.add(c), a = Ti.bind(null, a, b, c), b.then(a, a));
      }
      function Ui(a) {
        do {
          var b;
          if (b = 13 === a.tag) b = a.memoizedState, b = null !== b ? null !== b.dehydrated ? true : false : true;
          if (b) return a;
          a = a.return;
        } while (null !== a);
        return null;
      }
      function Vi(a, b, c, d, e) {
        if (0 === (a.mode & 1)) return a === b ? a.flags |= 65536 : (a.flags |= 128, c.flags |= 131072, c.flags &= -52805, 1 === c.tag && (null === c.alternate ? c.tag = 17 : (b = mh(-1, 1), b.tag = 2, nh(c, b, 1))), c.lanes |= 1), a;
        a.flags |= 65536;
        a.lanes = e;
        return a;
      }
      var Wi = ua.ReactCurrentOwner, dh = false;
      function Xi(a, b, c, d) {
        b.child = null === a ? Vg(b, null, c, d) : Ug(b, a.child, c, d);
      }
      function Yi(a, b, c, d, e) {
        c = c.render;
        var f = b.ref;
        ch(b, e);
        d = Nh(a, b, c, d, f, e);
        c = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && c && vg(b);
        b.flags |= 1;
        Xi(a, b, d, e);
        return b.child;
      }
      function $i(a, b, c, d, e) {
        if (null === a) {
          var f = c.type;
          if ("function" === typeof f && !aj(f) && void 0 === f.defaultProps && null === c.compare && void 0 === c.defaultProps) return b.tag = 15, b.type = f, bj(a, b, f, d, e);
          a = Rg(c.type, null, d, b, b.mode, e);
          a.ref = b.ref;
          a.return = b;
          return b.child = a;
        }
        f = a.child;
        if (0 === (a.lanes & e)) {
          var g = f.memoizedProps;
          c = c.compare;
          c = null !== c ? c : Ie;
          if (c(g, d) && a.ref === b.ref) return Zi(a, b, e);
        }
        b.flags |= 1;
        a = Pg(f, d);
        a.ref = b.ref;
        a.return = b;
        return b.child = a;
      }
      function bj(a, b, c, d, e) {
        if (null !== a) {
          var f = a.memoizedProps;
          if (Ie(f, d) && a.ref === b.ref) if (dh = false, b.pendingProps = d = f, 0 !== (a.lanes & e)) 0 !== (a.flags & 131072) && (dh = true);
          else return b.lanes = a.lanes, Zi(a, b, e);
        }
        return cj(a, b, c, d, e);
      }
      function dj(a, b, c) {
        var d = b.pendingProps, e = d.children, f = null !== a ? a.memoizedState : null;
        if ("hidden" === d.mode) if (0 === (b.mode & 1)) b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null }, G(ej, fj), fj |= c;
        else {
          if (0 === (c & 1073741824)) return a = null !== f ? f.baseLanes | c : c, b.lanes = b.childLanes = 1073741824, b.memoizedState = { baseLanes: a, cachePool: null, transitions: null }, b.updateQueue = null, G(ej, fj), fj |= a, null;
          b.memoizedState = { baseLanes: 0, cachePool: null, transitions: null };
          d = null !== f ? f.baseLanes : c;
          G(ej, fj);
          fj |= d;
        }
        else null !== f ? (d = f.baseLanes | c, b.memoizedState = null) : d = c, G(ej, fj), fj |= d;
        Xi(a, b, e, c);
        return b.child;
      }
      function gj(a, b) {
        var c = b.ref;
        if (null === a && null !== c || null !== a && a.ref !== c) b.flags |= 512, b.flags |= 2097152;
      }
      function cj(a, b, c, d, e) {
        var f = Zf(c) ? Xf : H.current;
        f = Yf(b, f);
        ch(b, e);
        c = Nh(a, b, c, d, f, e);
        d = Sh();
        if (null !== a && !dh) return b.updateQueue = a.updateQueue, b.flags &= -2053, a.lanes &= ~e, Zi(a, b, e);
        I && d && vg(b);
        b.flags |= 1;
        Xi(a, b, c, e);
        return b.child;
      }
      function hj(a, b, c, d, e) {
        if (Zf(c)) {
          var f = true;
          cg(b);
        } else f = false;
        ch(b, e);
        if (null === b.stateNode) ij(a, b), Gi(b, c, d), Ii(b, c, d, e), d = true;
        else if (null === a) {
          var g = b.stateNode, h = b.memoizedProps;
          g.props = h;
          var k = g.context, l = c.contextType;
          "object" === typeof l && null !== l ? l = eh(l) : (l = Zf(c) ? Xf : H.current, l = Yf(b, l));
          var m = c.getDerivedStateFromProps, q = "function" === typeof m || "function" === typeof g.getSnapshotBeforeUpdate;
          q || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== d || k !== l) && Hi(b, g, d, l);
          jh = false;
          var r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          k = b.memoizedState;
          h !== d || r !== k || Wf.current || jh ? ("function" === typeof m && (Di(b, c, m, d), k = b.memoizedState), (h = jh || Fi(b, c, h, d, r, k, l)) ? (q || "function" !== typeof g.UNSAFE_componentWillMount && "function" !== typeof g.componentWillMount || ("function" === typeof g.componentWillMount && g.componentWillMount(), "function" === typeof g.UNSAFE_componentWillMount && g.UNSAFE_componentWillMount()), "function" === typeof g.componentDidMount && (b.flags |= 4194308)) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), b.memoizedProps = d, b.memoizedState = k), g.props = d, g.state = k, g.context = l, d = h) : ("function" === typeof g.componentDidMount && (b.flags |= 4194308), d = false);
        } else {
          g = b.stateNode;
          lh(a, b);
          h = b.memoizedProps;
          l = b.type === b.elementType ? h : Ci(b.type, h);
          g.props = l;
          q = b.pendingProps;
          r = g.context;
          k = c.contextType;
          "object" === typeof k && null !== k ? k = eh(k) : (k = Zf(c) ? Xf : H.current, k = Yf(b, k));
          var y = c.getDerivedStateFromProps;
          (m = "function" === typeof y || "function" === typeof g.getSnapshotBeforeUpdate) || "function" !== typeof g.UNSAFE_componentWillReceiveProps && "function" !== typeof g.componentWillReceiveProps || (h !== q || r !== k) && Hi(b, g, d, k);
          jh = false;
          r = b.memoizedState;
          g.state = r;
          qh(b, d, g, e);
          var n = b.memoizedState;
          h !== q || r !== n || Wf.current || jh ? ("function" === typeof y && (Di(b, c, y, d), n = b.memoizedState), (l = jh || Fi(b, c, l, d, r, n, k) || false) ? (m || "function" !== typeof g.UNSAFE_componentWillUpdate && "function" !== typeof g.componentWillUpdate || ("function" === typeof g.componentWillUpdate && g.componentWillUpdate(d, n, k), "function" === typeof g.UNSAFE_componentWillUpdate && g.UNSAFE_componentWillUpdate(d, n, k)), "function" === typeof g.componentDidUpdate && (b.flags |= 4), "function" === typeof g.getSnapshotBeforeUpdate && (b.flags |= 1024)) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), b.memoizedProps = d, b.memoizedState = n), g.props = d, g.state = n, g.context = k, d = l) : ("function" !== typeof g.componentDidUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 4), "function" !== typeof g.getSnapshotBeforeUpdate || h === a.memoizedProps && r === a.memoizedState || (b.flags |= 1024), d = false);
        }
        return jj(a, b, c, d, f, e);
      }
      function jj(a, b, c, d, e, f) {
        gj(a, b);
        var g = 0 !== (b.flags & 128);
        if (!d && !g) return e && dg(b, c, false), Zi(a, b, f);
        d = b.stateNode;
        Wi.current = b;
        var h = g && "function" !== typeof c.getDerivedStateFromError ? null : d.render();
        b.flags |= 1;
        null !== a && g ? (b.child = Ug(b, a.child, null, f), b.child = Ug(b, null, h, f)) : Xi(a, b, h, f);
        b.memoizedState = d.state;
        e && dg(b, c, true);
        return b.child;
      }
      function kj(a) {
        var b = a.stateNode;
        b.pendingContext ? ag(a, b.pendingContext, b.pendingContext !== b.context) : b.context && ag(a, b.context, false);
        yh(a, b.containerInfo);
      }
      function lj(a, b, c, d, e) {
        Ig();
        Jg(e);
        b.flags |= 256;
        Xi(a, b, c, d);
        return b.child;
      }
      var mj = { dehydrated: null, treeContext: null, retryLane: 0 };
      function nj(a) {
        return { baseLanes: a, cachePool: null, transitions: null };
      }
      function oj(a, b, c) {
        var d = b.pendingProps, e = L.current, f = false, g = 0 !== (b.flags & 128), h;
        (h = g) || (h = null !== a && null === a.memoizedState ? false : 0 !== (e & 2));
        if (h) f = true, b.flags &= -129;
        else if (null === a || null !== a.memoizedState) e |= 1;
        G(L, e & 1);
        if (null === a) {
          Eg(b);
          a = b.memoizedState;
          if (null !== a && (a = a.dehydrated, null !== a)) return 0 === (b.mode & 1) ? b.lanes = 1 : "$!" === a.data ? b.lanes = 8 : b.lanes = 1073741824, null;
          g = d.children;
          a = d.fallback;
          return f ? (d = b.mode, f = b.child, g = { mode: "hidden", children: g }, 0 === (d & 1) && null !== f ? (f.childLanes = 0, f.pendingProps = g) : f = pj(g, d, 0, null), a = Tg(a, d, c, null), f.return = b, a.return = b, f.sibling = a, b.child = f, b.child.memoizedState = nj(c), b.memoizedState = mj, a) : qj(b, g);
        }
        e = a.memoizedState;
        if (null !== e && (h = e.dehydrated, null !== h)) return rj(a, b, g, d, h, e, c);
        if (f) {
          f = d.fallback;
          g = b.mode;
          e = a.child;
          h = e.sibling;
          var k = { mode: "hidden", children: d.children };
          0 === (g & 1) && b.child !== e ? (d = b.child, d.childLanes = 0, d.pendingProps = k, b.deletions = null) : (d = Pg(e, k), d.subtreeFlags = e.subtreeFlags & 14680064);
          null !== h ? f = Pg(h, f) : (f = Tg(f, g, c, null), f.flags |= 2);
          f.return = b;
          d.return = b;
          d.sibling = f;
          b.child = d;
          d = f;
          f = b.child;
          g = a.child.memoizedState;
          g = null === g ? nj(c) : { baseLanes: g.baseLanes | c, cachePool: null, transitions: g.transitions };
          f.memoizedState = g;
          f.childLanes = a.childLanes & ~c;
          b.memoizedState = mj;
          return d;
        }
        f = a.child;
        a = f.sibling;
        d = Pg(f, { mode: "visible", children: d.children });
        0 === (b.mode & 1) && (d.lanes = c);
        d.return = b;
        d.sibling = null;
        null !== a && (c = b.deletions, null === c ? (b.deletions = [a], b.flags |= 16) : c.push(a));
        b.child = d;
        b.memoizedState = null;
        return d;
      }
      function qj(a, b) {
        b = pj({ mode: "visible", children: b }, a.mode, 0, null);
        b.return = a;
        return a.child = b;
      }
      function sj(a, b, c, d) {
        null !== d && Jg(d);
        Ug(b, a.child, null, c);
        a = qj(b, b.pendingProps.children);
        a.flags |= 2;
        b.memoizedState = null;
        return a;
      }
      function rj(a, b, c, d, e, f, g) {
        if (c) {
          if (b.flags & 256) return b.flags &= -257, d = Ki(Error(p(422))), sj(a, b, g, d);
          if (null !== b.memoizedState) return b.child = a.child, b.flags |= 128, null;
          f = d.fallback;
          e = b.mode;
          d = pj({ mode: "visible", children: d.children }, e, 0, null);
          f = Tg(f, e, g, null);
          f.flags |= 2;
          d.return = b;
          f.return = b;
          d.sibling = f;
          b.child = d;
          0 !== (b.mode & 1) && Ug(b, a.child, null, g);
          b.child.memoizedState = nj(g);
          b.memoizedState = mj;
          return f;
        }
        if (0 === (b.mode & 1)) return sj(a, b, g, null);
        if ("$!" === e.data) {
          d = e.nextSibling && e.nextSibling.dataset;
          if (d) var h = d.dgst;
          d = h;
          f = Error(p(419));
          d = Ki(f, d, void 0);
          return sj(a, b, g, d);
        }
        h = 0 !== (g & a.childLanes);
        if (dh || h) {
          d = Q;
          if (null !== d) {
            switch (g & -g) {
              case 4:
                e = 2;
                break;
              case 16:
                e = 8;
                break;
              case 64:
              case 128:
              case 256:
              case 512:
              case 1024:
              case 2048:
              case 4096:
              case 8192:
              case 16384:
              case 32768:
              case 65536:
              case 131072:
              case 262144:
              case 524288:
              case 1048576:
              case 2097152:
              case 4194304:
              case 8388608:
              case 16777216:
              case 33554432:
              case 67108864:
                e = 32;
                break;
              case 536870912:
                e = 268435456;
                break;
              default:
                e = 0;
            }
            e = 0 !== (e & (d.suspendedLanes | g)) ? 0 : e;
            0 !== e && e !== f.retryLane && (f.retryLane = e, ih(a, e), gi(d, a, e, -1));
          }
          tj();
          d = Ki(Error(p(421)));
          return sj(a, b, g, d);
        }
        if ("$?" === e.data) return b.flags |= 128, b.child = a.child, b = uj.bind(null, a), e._reactRetry = b, null;
        a = f.treeContext;
        yg = Lf(e.nextSibling);
        xg = b;
        I = true;
        zg = null;
        null !== a && (og[pg++] = rg, og[pg++] = sg, og[pg++] = qg, rg = a.id, sg = a.overflow, qg = b);
        b = qj(b, d.children);
        b.flags |= 4096;
        return b;
      }
      function vj(a, b, c) {
        a.lanes |= b;
        var d = a.alternate;
        null !== d && (d.lanes |= b);
        bh(a.return, b, c);
      }
      function wj(a, b, c, d, e) {
        var f = a.memoizedState;
        null === f ? a.memoizedState = { isBackwards: b, rendering: null, renderingStartTime: 0, last: d, tail: c, tailMode: e } : (f.isBackwards = b, f.rendering = null, f.renderingStartTime = 0, f.last = d, f.tail = c, f.tailMode = e);
      }
      function xj(a, b, c) {
        var d = b.pendingProps, e = d.revealOrder, f = d.tail;
        Xi(a, b, d.children, c);
        d = L.current;
        if (0 !== (d & 2)) d = d & 1 | 2, b.flags |= 128;
        else {
          if (null !== a && 0 !== (a.flags & 128)) a: for (a = b.child; null !== a; ) {
            if (13 === a.tag) null !== a.memoizedState && vj(a, c, b);
            else if (19 === a.tag) vj(a, c, b);
            else if (null !== a.child) {
              a.child.return = a;
              a = a.child;
              continue;
            }
            if (a === b) break a;
            for (; null === a.sibling; ) {
              if (null === a.return || a.return === b) break a;
              a = a.return;
            }
            a.sibling.return = a.return;
            a = a.sibling;
          }
          d &= 1;
        }
        G(L, d);
        if (0 === (b.mode & 1)) b.memoizedState = null;
        else switch (e) {
          case "forwards":
            c = b.child;
            for (e = null; null !== c; ) a = c.alternate, null !== a && null === Ch(a) && (e = c), c = c.sibling;
            c = e;
            null === c ? (e = b.child, b.child = null) : (e = c.sibling, c.sibling = null);
            wj(b, false, e, c, f);
            break;
          case "backwards":
            c = null;
            e = b.child;
            for (b.child = null; null !== e; ) {
              a = e.alternate;
              if (null !== a && null === Ch(a)) {
                b.child = e;
                break;
              }
              a = e.sibling;
              e.sibling = c;
              c = e;
              e = a;
            }
            wj(b, true, c, null, f);
            break;
          case "together":
            wj(b, false, null, null, void 0);
            break;
          default:
            b.memoizedState = null;
        }
        return b.child;
      }
      function ij(a, b) {
        0 === (b.mode & 1) && null !== a && (a.alternate = null, b.alternate = null, b.flags |= 2);
      }
      function Zi(a, b, c) {
        null !== a && (b.dependencies = a.dependencies);
        rh |= b.lanes;
        if (0 === (c & b.childLanes)) return null;
        if (null !== a && b.child !== a.child) throw Error(p(153));
        if (null !== b.child) {
          a = b.child;
          c = Pg(a, a.pendingProps);
          b.child = c;
          for (c.return = b; null !== a.sibling; ) a = a.sibling, c = c.sibling = Pg(a, a.pendingProps), c.return = b;
          c.sibling = null;
        }
        return b.child;
      }
      function yj(a, b, c) {
        switch (b.tag) {
          case 3:
            kj(b);
            Ig();
            break;
          case 5:
            Ah(b);
            break;
          case 1:
            Zf(b.type) && cg(b);
            break;
          case 4:
            yh(b, b.stateNode.containerInfo);
            break;
          case 10:
            var d = b.type._context, e = b.memoizedProps.value;
            G(Wg, d._currentValue);
            d._currentValue = e;
            break;
          case 13:
            d = b.memoizedState;
            if (null !== d) {
              if (null !== d.dehydrated) return G(L, L.current & 1), b.flags |= 128, null;
              if (0 !== (c & b.child.childLanes)) return oj(a, b, c);
              G(L, L.current & 1);
              a = Zi(a, b, c);
              return null !== a ? a.sibling : null;
            }
            G(L, L.current & 1);
            break;
          case 19:
            d = 0 !== (c & b.childLanes);
            if (0 !== (a.flags & 128)) {
              if (d) return xj(a, b, c);
              b.flags |= 128;
            }
            e = b.memoizedState;
            null !== e && (e.rendering = null, e.tail = null, e.lastEffect = null);
            G(L, L.current);
            if (d) break;
            else return null;
          case 22:
          case 23:
            return b.lanes = 0, dj(a, b, c);
        }
        return Zi(a, b, c);
      }
      var zj, Aj, Bj, Cj;
      zj = function(a, b) {
        for (var c = b.child; null !== c; ) {
          if (5 === c.tag || 6 === c.tag) a.appendChild(c.stateNode);
          else if (4 !== c.tag && null !== c.child) {
            c.child.return = c;
            c = c.child;
            continue;
          }
          if (c === b) break;
          for (; null === c.sibling; ) {
            if (null === c.return || c.return === b) return;
            c = c.return;
          }
          c.sibling.return = c.return;
          c = c.sibling;
        }
      };
      Aj = function() {
      };
      Bj = function(a, b, c, d) {
        var e = a.memoizedProps;
        if (e !== d) {
          a = b.stateNode;
          xh(uh.current);
          var f = null;
          switch (c) {
            case "input":
              e = Ya(a, e);
              d = Ya(a, d);
              f = [];
              break;
            case "select":
              e = A({}, e, { value: void 0 });
              d = A({}, d, { value: void 0 });
              f = [];
              break;
            case "textarea":
              e = gb(a, e);
              d = gb(a, d);
              f = [];
              break;
            default:
              "function" !== typeof e.onClick && "function" === typeof d.onClick && (a.onclick = Bf);
          }
          ub(c, d);
          var g;
          c = null;
          for (l in e) if (!d.hasOwnProperty(l) && e.hasOwnProperty(l) && null != e[l]) if ("style" === l) {
            var h = e[l];
            for (g in h) h.hasOwnProperty(g) && (c || (c = {}), c[g] = "");
          } else "dangerouslySetInnerHTML" !== l && "children" !== l && "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && "autoFocus" !== l && (ea.hasOwnProperty(l) ? f || (f = []) : (f = f || []).push(l, null));
          for (l in d) {
            var k = d[l];
            h = null != e ? e[l] : void 0;
            if (d.hasOwnProperty(l) && k !== h && (null != k || null != h)) if ("style" === l) if (h) {
              for (g in h) !h.hasOwnProperty(g) || k && k.hasOwnProperty(g) || (c || (c = {}), c[g] = "");
              for (g in k) k.hasOwnProperty(g) && h[g] !== k[g] && (c || (c = {}), c[g] = k[g]);
            } else c || (f || (f = []), f.push(
              l,
              c
            )), c = k;
            else "dangerouslySetInnerHTML" === l ? (k = k ? k.__html : void 0, h = h ? h.__html : void 0, null != k && h !== k && (f = f || []).push(l, k)) : "children" === l ? "string" !== typeof k && "number" !== typeof k || (f = f || []).push(l, "" + k) : "suppressContentEditableWarning" !== l && "suppressHydrationWarning" !== l && (ea.hasOwnProperty(l) ? (null != k && "onScroll" === l && D("scroll", a), f || h === k || (f = [])) : (f = f || []).push(l, k));
          }
          c && (f = f || []).push("style", c);
          var l = f;
          if (b.updateQueue = l) b.flags |= 4;
        }
      };
      Cj = function(a, b, c, d) {
        c !== d && (b.flags |= 4);
      };
      function Dj(a, b) {
        if (!I) switch (a.tailMode) {
          case "hidden":
            b = a.tail;
            for (var c = null; null !== b; ) null !== b.alternate && (c = b), b = b.sibling;
            null === c ? a.tail = null : c.sibling = null;
            break;
          case "collapsed":
            c = a.tail;
            for (var d = null; null !== c; ) null !== c.alternate && (d = c), c = c.sibling;
            null === d ? b || null === a.tail ? a.tail = null : a.tail.sibling = null : d.sibling = null;
        }
      }
      function S(a) {
        var b = null !== a.alternate && a.alternate.child === a.child, c = 0, d = 0;
        if (b) for (var e = a.child; null !== e; ) c |= e.lanes | e.childLanes, d |= e.subtreeFlags & 14680064, d |= e.flags & 14680064, e.return = a, e = e.sibling;
        else for (e = a.child; null !== e; ) c |= e.lanes | e.childLanes, d |= e.subtreeFlags, d |= e.flags, e.return = a, e = e.sibling;
        a.subtreeFlags |= d;
        a.childLanes = c;
        return b;
      }
      function Ej(a, b, c) {
        var d = b.pendingProps;
        wg(b);
        switch (b.tag) {
          case 2:
          case 16:
          case 15:
          case 0:
          case 11:
          case 7:
          case 8:
          case 12:
          case 9:
          case 14:
            return S(b), null;
          case 1:
            return Zf(b.type) && $f(), S(b), null;
          case 3:
            d = b.stateNode;
            zh();
            E(Wf);
            E(H);
            Eh();
            d.pendingContext && (d.context = d.pendingContext, d.pendingContext = null);
            if (null === a || null === a.child) Gg(b) ? b.flags |= 4 : null === a || a.memoizedState.isDehydrated && 0 === (b.flags & 256) || (b.flags |= 1024, null !== zg && (Fj(zg), zg = null));
            Aj(a, b);
            S(b);
            return null;
          case 5:
            Bh(b);
            var e = xh(wh.current);
            c = b.type;
            if (null !== a && null != b.stateNode) Bj(a, b, c, d, e), a.ref !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            else {
              if (!d) {
                if (null === b.stateNode) throw Error(p(166));
                S(b);
                return null;
              }
              a = xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.type;
                var f = b.memoizedProps;
                d[Of] = b;
                d[Pf] = f;
                a = 0 !== (b.mode & 1);
                switch (c) {
                  case "dialog":
                    D("cancel", d);
                    D("close", d);
                    break;
                  case "iframe":
                  case "object":
                  case "embed":
                    D("load", d);
                    break;
                  case "video":
                  case "audio":
                    for (e = 0; e < lf.length; e++) D(lf[e], d);
                    break;
                  case "source":
                    D("error", d);
                    break;
                  case "img":
                  case "image":
                  case "link":
                    D(
                      "error",
                      d
                    );
                    D("load", d);
                    break;
                  case "details":
                    D("toggle", d);
                    break;
                  case "input":
                    Za(d, f);
                    D("invalid", d);
                    break;
                  case "select":
                    d._wrapperState = { wasMultiple: !!f.multiple };
                    D("invalid", d);
                    break;
                  case "textarea":
                    hb(d, f), D("invalid", d);
                }
                ub(c, f);
                e = null;
                for (var g in f) if (f.hasOwnProperty(g)) {
                  var h = f[g];
                  "children" === g ? "string" === typeof h ? d.textContent !== h && (true !== f.suppressHydrationWarning && Af(d.textContent, h, a), e = ["children", h]) : "number" === typeof h && d.textContent !== "" + h && (true !== f.suppressHydrationWarning && Af(
                    d.textContent,
                    h,
                    a
                  ), e = ["children", "" + h]) : ea.hasOwnProperty(g) && null != h && "onScroll" === g && D("scroll", d);
                }
                switch (c) {
                  case "input":
                    Va(d);
                    db(d, f, true);
                    break;
                  case "textarea":
                    Va(d);
                    jb(d);
                    break;
                  case "select":
                  case "option":
                    break;
                  default:
                    "function" === typeof f.onClick && (d.onclick = Bf);
                }
                d = e;
                b.updateQueue = d;
                null !== d && (b.flags |= 4);
              } else {
                g = 9 === e.nodeType ? e : e.ownerDocument;
                "http://www.w3.org/1999/xhtml" === a && (a = kb(c));
                "http://www.w3.org/1999/xhtml" === a ? "script" === c ? (a = g.createElement("div"), a.innerHTML = "<script><\/script>", a = a.removeChild(a.firstChild)) : "string" === typeof d.is ? a = g.createElement(c, { is: d.is }) : (a = g.createElement(c), "select" === c && (g = a, d.multiple ? g.multiple = true : d.size && (g.size = d.size))) : a = g.createElementNS(a, c);
                a[Of] = b;
                a[Pf] = d;
                zj(a, b, false, false);
                b.stateNode = a;
                a: {
                  g = vb(c, d);
                  switch (c) {
                    case "dialog":
                      D("cancel", a);
                      D("close", a);
                      e = d;
                      break;
                    case "iframe":
                    case "object":
                    case "embed":
                      D("load", a);
                      e = d;
                      break;
                    case "video":
                    case "audio":
                      for (e = 0; e < lf.length; e++) D(lf[e], a);
                      e = d;
                      break;
                    case "source":
                      D("error", a);
                      e = d;
                      break;
                    case "img":
                    case "image":
                    case "link":
                      D(
                        "error",
                        a
                      );
                      D("load", a);
                      e = d;
                      break;
                    case "details":
                      D("toggle", a);
                      e = d;
                      break;
                    case "input":
                      Za(a, d);
                      e = Ya(a, d);
                      D("invalid", a);
                      break;
                    case "option":
                      e = d;
                      break;
                    case "select":
                      a._wrapperState = { wasMultiple: !!d.multiple };
                      e = A({}, d, { value: void 0 });
                      D("invalid", a);
                      break;
                    case "textarea":
                      hb(a, d);
                      e = gb(a, d);
                      D("invalid", a);
                      break;
                    default:
                      e = d;
                  }
                  ub(c, e);
                  h = e;
                  for (f in h) if (h.hasOwnProperty(f)) {
                    var k = h[f];
                    "style" === f ? sb(a, k) : "dangerouslySetInnerHTML" === f ? (k = k ? k.__html : void 0, null != k && nb(a, k)) : "children" === f ? "string" === typeof k ? ("textarea" !== c || "" !== k) && ob(a, k) : "number" === typeof k && ob(a, "" + k) : "suppressContentEditableWarning" !== f && "suppressHydrationWarning" !== f && "autoFocus" !== f && (ea.hasOwnProperty(f) ? null != k && "onScroll" === f && D("scroll", a) : null != k && ta(a, f, k, g));
                  }
                  switch (c) {
                    case "input":
                      Va(a);
                      db(a, d, false);
                      break;
                    case "textarea":
                      Va(a);
                      jb(a);
                      break;
                    case "option":
                      null != d.value && a.setAttribute("value", "" + Sa(d.value));
                      break;
                    case "select":
                      a.multiple = !!d.multiple;
                      f = d.value;
                      null != f ? fb(a, !!d.multiple, f, false) : null != d.defaultValue && fb(
                        a,
                        !!d.multiple,
                        d.defaultValue,
                        true
                      );
                      break;
                    default:
                      "function" === typeof e.onClick && (a.onclick = Bf);
                  }
                  switch (c) {
                    case "button":
                    case "input":
                    case "select":
                    case "textarea":
                      d = !!d.autoFocus;
                      break a;
                    case "img":
                      d = true;
                      break a;
                    default:
                      d = false;
                  }
                }
                d && (b.flags |= 4);
              }
              null !== b.ref && (b.flags |= 512, b.flags |= 2097152);
            }
            S(b);
            return null;
          case 6:
            if (a && null != b.stateNode) Cj(a, b, a.memoizedProps, d);
            else {
              if ("string" !== typeof d && null === b.stateNode) throw Error(p(166));
              c = xh(wh.current);
              xh(uh.current);
              if (Gg(b)) {
                d = b.stateNode;
                c = b.memoizedProps;
                d[Of] = b;
                if (f = d.nodeValue !== c) {
                  if (a = xg, null !== a) switch (a.tag) {
                    case 3:
                      Af(d.nodeValue, c, 0 !== (a.mode & 1));
                      break;
                    case 5:
                      true !== a.memoizedProps.suppressHydrationWarning && Af(d.nodeValue, c, 0 !== (a.mode & 1));
                  }
                }
                f && (b.flags |= 4);
              } else d = (9 === c.nodeType ? c : c.ownerDocument).createTextNode(d), d[Of] = b, b.stateNode = d;
            }
            S(b);
            return null;
          case 13:
            E(L);
            d = b.memoizedState;
            if (null === a || null !== a.memoizedState && null !== a.memoizedState.dehydrated) {
              if (I && null !== yg && 0 !== (b.mode & 1) && 0 === (b.flags & 128)) Hg(), Ig(), b.flags |= 98560, f = false;
              else if (f = Gg(b), null !== d && null !== d.dehydrated) {
                if (null === a) {
                  if (!f) throw Error(p(318));
                  f = b.memoizedState;
                  f = null !== f ? f.dehydrated : null;
                  if (!f) throw Error(p(317));
                  f[Of] = b;
                } else Ig(), 0 === (b.flags & 128) && (b.memoizedState = null), b.flags |= 4;
                S(b);
                f = false;
              } else null !== zg && (Fj(zg), zg = null), f = true;
              if (!f) return b.flags & 65536 ? b : null;
            }
            if (0 !== (b.flags & 128)) return b.lanes = c, b;
            d = null !== d;
            d !== (null !== a && null !== a.memoizedState) && d && (b.child.flags |= 8192, 0 !== (b.mode & 1) && (null === a || 0 !== (L.current & 1) ? 0 === T && (T = 3) : tj()));
            null !== b.updateQueue && (b.flags |= 4);
            S(b);
            return null;
          case 4:
            return zh(), Aj(a, b), null === a && sf(b.stateNode.containerInfo), S(b), null;
          case 10:
            return ah(b.type._context), S(b), null;
          case 17:
            return Zf(b.type) && $f(), S(b), null;
          case 19:
            E(L);
            f = b.memoizedState;
            if (null === f) return S(b), null;
            d = 0 !== (b.flags & 128);
            g = f.rendering;
            if (null === g) if (d) Dj(f, false);
            else {
              if (0 !== T || null !== a && 0 !== (a.flags & 128)) for (a = b.child; null !== a; ) {
                g = Ch(a);
                if (null !== g) {
                  b.flags |= 128;
                  Dj(f, false);
                  d = g.updateQueue;
                  null !== d && (b.updateQueue = d, b.flags |= 4);
                  b.subtreeFlags = 0;
                  d = c;
                  for (c = b.child; null !== c; ) f = c, a = d, f.flags &= 14680066, g = f.alternate, null === g ? (f.childLanes = 0, f.lanes = a, f.child = null, f.subtreeFlags = 0, f.memoizedProps = null, f.memoizedState = null, f.updateQueue = null, f.dependencies = null, f.stateNode = null) : (f.childLanes = g.childLanes, f.lanes = g.lanes, f.child = g.child, f.subtreeFlags = 0, f.deletions = null, f.memoizedProps = g.memoizedProps, f.memoizedState = g.memoizedState, f.updateQueue = g.updateQueue, f.type = g.type, a = g.dependencies, f.dependencies = null === a ? null : { lanes: a.lanes, firstContext: a.firstContext }), c = c.sibling;
                  G(L, L.current & 1 | 2);
                  return b.child;
                }
                a = a.sibling;
              }
              null !== f.tail && B() > Gj && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
            }
            else {
              if (!d) if (a = Ch(g), null !== a) {
                if (b.flags |= 128, d = true, c = a.updateQueue, null !== c && (b.updateQueue = c, b.flags |= 4), Dj(f, true), null === f.tail && "hidden" === f.tailMode && !g.alternate && !I) return S(b), null;
              } else 2 * B() - f.renderingStartTime > Gj && 1073741824 !== c && (b.flags |= 128, d = true, Dj(f, false), b.lanes = 4194304);
              f.isBackwards ? (g.sibling = b.child, b.child = g) : (c = f.last, null !== c ? c.sibling = g : b.child = g, f.last = g);
            }
            if (null !== f.tail) return b = f.tail, f.rendering = b, f.tail = b.sibling, f.renderingStartTime = B(), b.sibling = null, c = L.current, G(L, d ? c & 1 | 2 : c & 1), b;
            S(b);
            return null;
          case 22:
          case 23:
            return Hj(), d = null !== b.memoizedState, null !== a && null !== a.memoizedState !== d && (b.flags |= 8192), d && 0 !== (b.mode & 1) ? 0 !== (fj & 1073741824) && (S(b), b.subtreeFlags & 6 && (b.flags |= 8192)) : S(b), null;
          case 24:
            return null;
          case 25:
            return null;
        }
        throw Error(p(156, b.tag));
      }
      function Ij(a, b) {
        wg(b);
        switch (b.tag) {
          case 1:
            return Zf(b.type) && $f(), a = b.flags, a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 3:
            return zh(), E(Wf), E(H), Eh(), a = b.flags, 0 !== (a & 65536) && 0 === (a & 128) ? (b.flags = a & -65537 | 128, b) : null;
          case 5:
            return Bh(b), null;
          case 13:
            E(L);
            a = b.memoizedState;
            if (null !== a && null !== a.dehydrated) {
              if (null === b.alternate) throw Error(p(340));
              Ig();
            }
            a = b.flags;
            return a & 65536 ? (b.flags = a & -65537 | 128, b) : null;
          case 19:
            return E(L), null;
          case 4:
            return zh(), null;
          case 10:
            return ah(b.type._context), null;
          case 22:
          case 23:
            return Hj(), null;
          case 24:
            return null;
          default:
            return null;
        }
      }
      var Jj = false, U = false, Kj = "function" === typeof WeakSet ? WeakSet : Set, V = null;
      function Lj(a, b) {
        var c = a.ref;
        if (null !== c) if ("function" === typeof c) try {
          c(null);
        } catch (d) {
          W(a, b, d);
        }
        else c.current = null;
      }
      function Mj(a, b, c) {
        try {
          c();
        } catch (d) {
          W(a, b, d);
        }
      }
      var Nj = false;
      function Oj(a, b) {
        Cf = dd;
        a = Me();
        if (Ne(a)) {
          if ("selectionStart" in a) var c = { start: a.selectionStart, end: a.selectionEnd };
          else a: {
            c = (c = a.ownerDocument) && c.defaultView || window;
            var d = c.getSelection && c.getSelection();
            if (d && 0 !== d.rangeCount) {
              c = d.anchorNode;
              var e = d.anchorOffset, f = d.focusNode;
              d = d.focusOffset;
              try {
                c.nodeType, f.nodeType;
              } catch (F) {
                c = null;
                break a;
              }
              var g = 0, h = -1, k = -1, l = 0, m = 0, q = a, r = null;
              b: for (; ; ) {
                for (var y; ; ) {
                  q !== c || 0 !== e && 3 !== q.nodeType || (h = g + e);
                  q !== f || 0 !== d && 3 !== q.nodeType || (k = g + d);
                  3 === q.nodeType && (g += q.nodeValue.length);
                  if (null === (y = q.firstChild)) break;
                  r = q;
                  q = y;
                }
                for (; ; ) {
                  if (q === a) break b;
                  r === c && ++l === e && (h = g);
                  r === f && ++m === d && (k = g);
                  if (null !== (y = q.nextSibling)) break;
                  q = r;
                  r = q.parentNode;
                }
                q = y;
              }
              c = -1 === h || -1 === k ? null : { start: h, end: k };
            } else c = null;
          }
          c = c || { start: 0, end: 0 };
        } else c = null;
        Df = { focusedElem: a, selectionRange: c };
        dd = false;
        for (V = b; null !== V; ) if (b = V, a = b.child, 0 !== (b.subtreeFlags & 1028) && null !== a) a.return = b, V = a;
        else for (; null !== V; ) {
          b = V;
          try {
            var n = b.alternate;
            if (0 !== (b.flags & 1024)) switch (b.tag) {
              case 0:
              case 11:
              case 15:
                break;
              case 1:
                if (null !== n) {
                  var t = n.memoizedProps, J = n.memoizedState, x = b.stateNode, w = x.getSnapshotBeforeUpdate(b.elementType === b.type ? t : Ci(b.type, t), J);
                  x.__reactInternalSnapshotBeforeUpdate = w;
                }
                break;
              case 3:
                var u = b.stateNode.containerInfo;
                1 === u.nodeType ? u.textContent = "" : 9 === u.nodeType && u.documentElement && u.removeChild(u.documentElement);
                break;
              case 5:
              case 6:
              case 4:
              case 17:
                break;
              default:
                throw Error(p(163));
            }
          } catch (F) {
            W(b, b.return, F);
          }
          a = b.sibling;
          if (null !== a) {
            a.return = b.return;
            V = a;
            break;
          }
          V = b.return;
        }
        n = Nj;
        Nj = false;
        return n;
      }
      function Pj(a, b, c) {
        var d = b.updateQueue;
        d = null !== d ? d.lastEffect : null;
        if (null !== d) {
          var e = d = d.next;
          do {
            if ((e.tag & a) === a) {
              var f = e.destroy;
              e.destroy = void 0;
              void 0 !== f && Mj(b, c, f);
            }
            e = e.next;
          } while (e !== d);
        }
      }
      function Qj(a, b) {
        b = b.updateQueue;
        b = null !== b ? b.lastEffect : null;
        if (null !== b) {
          var c = b = b.next;
          do {
            if ((c.tag & a) === a) {
              var d = c.create;
              c.destroy = d();
            }
            c = c.next;
          } while (c !== b);
        }
      }
      function Rj(a) {
        var b = a.ref;
        if (null !== b) {
          var c = a.stateNode;
          switch (a.tag) {
            case 5:
              a = c;
              break;
            default:
              a = c;
          }
          "function" === typeof b ? b(a) : b.current = a;
        }
      }
      function Sj(a) {
        var b = a.alternate;
        null !== b && (a.alternate = null, Sj(b));
        a.child = null;
        a.deletions = null;
        a.sibling = null;
        5 === a.tag && (b = a.stateNode, null !== b && (delete b[Of], delete b[Pf], delete b[of], delete b[Qf], delete b[Rf]));
        a.stateNode = null;
        a.return = null;
        a.dependencies = null;
        a.memoizedProps = null;
        a.memoizedState = null;
        a.pendingProps = null;
        a.stateNode = null;
        a.updateQueue = null;
      }
      function Tj(a) {
        return 5 === a.tag || 3 === a.tag || 4 === a.tag;
      }
      function Uj(a) {
        a: for (; ; ) {
          for (; null === a.sibling; ) {
            if (null === a.return || Tj(a.return)) return null;
            a = a.return;
          }
          a.sibling.return = a.return;
          for (a = a.sibling; 5 !== a.tag && 6 !== a.tag && 18 !== a.tag; ) {
            if (a.flags & 2) continue a;
            if (null === a.child || 4 === a.tag) continue a;
            else a.child.return = a, a = a.child;
          }
          if (!(a.flags & 2)) return a.stateNode;
        }
      }
      function Vj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? 8 === c.nodeType ? c.parentNode.insertBefore(a, b) : c.insertBefore(a, b) : (8 === c.nodeType ? (b = c.parentNode, b.insertBefore(a, c)) : (b = c, b.appendChild(a)), c = c._reactRootContainer, null !== c && void 0 !== c || null !== b.onclick || (b.onclick = Bf));
        else if (4 !== d && (a = a.child, null !== a)) for (Vj(a, b, c), a = a.sibling; null !== a; ) Vj(a, b, c), a = a.sibling;
      }
      function Wj(a, b, c) {
        var d = a.tag;
        if (5 === d || 6 === d) a = a.stateNode, b ? c.insertBefore(a, b) : c.appendChild(a);
        else if (4 !== d && (a = a.child, null !== a)) for (Wj(a, b, c), a = a.sibling; null !== a; ) Wj(a, b, c), a = a.sibling;
      }
      var X2 = null, Xj = false;
      function Yj(a, b, c) {
        for (c = c.child; null !== c; ) Zj(a, b, c), c = c.sibling;
      }
      function Zj(a, b, c) {
        if (lc && "function" === typeof lc.onCommitFiberUnmount) try {
          lc.onCommitFiberUnmount(kc, c);
        } catch (h) {
        }
        switch (c.tag) {
          case 5:
            U || Lj(c, b);
          case 6:
            var d = X2, e = Xj;
            X2 = null;
            Yj(a, b, c);
            X2 = d;
            Xj = e;
            null !== X2 && (Xj ? (a = X2, c = c.stateNode, 8 === a.nodeType ? a.parentNode.removeChild(c) : a.removeChild(c)) : X2.removeChild(c.stateNode));
            break;
          case 18:
            null !== X2 && (Xj ? (a = X2, c = c.stateNode, 8 === a.nodeType ? Kf(a.parentNode, c) : 1 === a.nodeType && Kf(a, c), bd(a)) : Kf(X2, c.stateNode));
            break;
          case 4:
            d = X2;
            e = Xj;
            X2 = c.stateNode.containerInfo;
            Xj = true;
            Yj(a, b, c);
            X2 = d;
            Xj = e;
            break;
          case 0:
          case 11:
          case 14:
          case 15:
            if (!U && (d = c.updateQueue, null !== d && (d = d.lastEffect, null !== d))) {
              e = d = d.next;
              do {
                var f = e, g = f.destroy;
                f = f.tag;
                void 0 !== g && (0 !== (f & 2) ? Mj(c, b, g) : 0 !== (f & 4) && Mj(c, b, g));
                e = e.next;
              } while (e !== d);
            }
            Yj(a, b, c);
            break;
          case 1:
            if (!U && (Lj(c, b), d = c.stateNode, "function" === typeof d.componentWillUnmount)) try {
              d.props = c.memoizedProps, d.state = c.memoizedState, d.componentWillUnmount();
            } catch (h) {
              W(c, b, h);
            }
            Yj(a, b, c);
            break;
          case 21:
            Yj(a, b, c);
            break;
          case 22:
            c.mode & 1 ? (U = (d = U) || null !== c.memoizedState, Yj(a, b, c), U = d) : Yj(a, b, c);
            break;
          default:
            Yj(a, b, c);
        }
      }
      function ak(a) {
        var b = a.updateQueue;
        if (null !== b) {
          a.updateQueue = null;
          var c = a.stateNode;
          null === c && (c = a.stateNode = new Kj());
          b.forEach(function(b2) {
            var d = bk.bind(null, a, b2);
            c.has(b2) || (c.add(b2), b2.then(d, d));
          });
        }
      }
      function ck(a, b) {
        var c = b.deletions;
        if (null !== c) for (var d = 0; d < c.length; d++) {
          var e = c[d];
          try {
            var f = a, g = b, h = g;
            a: for (; null !== h; ) {
              switch (h.tag) {
                case 5:
                  X2 = h.stateNode;
                  Xj = false;
                  break a;
                case 3:
                  X2 = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
                case 4:
                  X2 = h.stateNode.containerInfo;
                  Xj = true;
                  break a;
              }
              h = h.return;
            }
            if (null === X2) throw Error(p(160));
            Zj(f, g, e);
            X2 = null;
            Xj = false;
            var k = e.alternate;
            null !== k && (k.return = null);
            e.return = null;
          } catch (l) {
            W(e, b, l);
          }
        }
        if (b.subtreeFlags & 12854) for (b = b.child; null !== b; ) dk(b, a), b = b.sibling;
      }
      function dk(a, b) {
        var c = a.alternate, d = a.flags;
        switch (a.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            ck(b, a);
            ek(a);
            if (d & 4) {
              try {
                Pj(3, a, a.return), Qj(3, a);
              } catch (t) {
                W(a, a.return, t);
              }
              try {
                Pj(5, a, a.return);
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 1:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            break;
          case 5:
            ck(b, a);
            ek(a);
            d & 512 && null !== c && Lj(c, c.return);
            if (a.flags & 32) {
              var e = a.stateNode;
              try {
                ob(e, "");
              } catch (t) {
                W(a, a.return, t);
              }
            }
            if (d & 4 && (e = a.stateNode, null != e)) {
              var f = a.memoizedProps, g = null !== c ? c.memoizedProps : f, h = a.type, k = a.updateQueue;
              a.updateQueue = null;
              if (null !== k) try {
                "input" === h && "radio" === f.type && null != f.name && ab(e, f);
                vb(h, g);
                var l = vb(h, f);
                for (g = 0; g < k.length; g += 2) {
                  var m = k[g], q = k[g + 1];
                  "style" === m ? sb(e, q) : "dangerouslySetInnerHTML" === m ? nb(e, q) : "children" === m ? ob(e, q) : ta(e, m, q, l);
                }
                switch (h) {
                  case "input":
                    bb(e, f);
                    break;
                  case "textarea":
                    ib(e, f);
                    break;
                  case "select":
                    var r = e._wrapperState.wasMultiple;
                    e._wrapperState.wasMultiple = !!f.multiple;
                    var y = f.value;
                    null != y ? fb(e, !!f.multiple, y, false) : r !== !!f.multiple && (null != f.defaultValue ? fb(
                      e,
                      !!f.multiple,
                      f.defaultValue,
                      true
                    ) : fb(e, !!f.multiple, f.multiple ? [] : "", false));
                }
                e[Pf] = f;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 6:
            ck(b, a);
            ek(a);
            if (d & 4) {
              if (null === a.stateNode) throw Error(p(162));
              e = a.stateNode;
              f = a.memoizedProps;
              try {
                e.nodeValue = f;
              } catch (t) {
                W(a, a.return, t);
              }
            }
            break;
          case 3:
            ck(b, a);
            ek(a);
            if (d & 4 && null !== c && c.memoizedState.isDehydrated) try {
              bd(b.containerInfo);
            } catch (t) {
              W(a, a.return, t);
            }
            break;
          case 4:
            ck(b, a);
            ek(a);
            break;
          case 13:
            ck(b, a);
            ek(a);
            e = a.child;
            e.flags & 8192 && (f = null !== e.memoizedState, e.stateNode.isHidden = f, !f || null !== e.alternate && null !== e.alternate.memoizedState || (fk = B()));
            d & 4 && ak(a);
            break;
          case 22:
            m = null !== c && null !== c.memoizedState;
            a.mode & 1 ? (U = (l = U) || m, ck(b, a), U = l) : ck(b, a);
            ek(a);
            if (d & 8192) {
              l = null !== a.memoizedState;
              if ((a.stateNode.isHidden = l) && !m && 0 !== (a.mode & 1)) for (V = a, m = a.child; null !== m; ) {
                for (q = V = m; null !== V; ) {
                  r = V;
                  y = r.child;
                  switch (r.tag) {
                    case 0:
                    case 11:
                    case 14:
                    case 15:
                      Pj(4, r, r.return);
                      break;
                    case 1:
                      Lj(r, r.return);
                      var n = r.stateNode;
                      if ("function" === typeof n.componentWillUnmount) {
                        d = r;
                        c = r.return;
                        try {
                          b = d, n.props = b.memoizedProps, n.state = b.memoizedState, n.componentWillUnmount();
                        } catch (t) {
                          W(d, c, t);
                        }
                      }
                      break;
                    case 5:
                      Lj(r, r.return);
                      break;
                    case 22:
                      if (null !== r.memoizedState) {
                        gk(q);
                        continue;
                      }
                  }
                  null !== y ? (y.return = r, V = y) : gk(q);
                }
                m = m.sibling;
              }
              a: for (m = null, q = a; ; ) {
                if (5 === q.tag) {
                  if (null === m) {
                    m = q;
                    try {
                      e = q.stateNode, l ? (f = e.style, "function" === typeof f.setProperty ? f.setProperty("display", "none", "important") : f.display = "none") : (h = q.stateNode, k = q.memoizedProps.style, g = void 0 !== k && null !== k && k.hasOwnProperty("display") ? k.display : null, h.style.display = rb("display", g));
                    } catch (t) {
                      W(a, a.return, t);
                    }
                  }
                } else if (6 === q.tag) {
                  if (null === m) try {
                    q.stateNode.nodeValue = l ? "" : q.memoizedProps;
                  } catch (t) {
                    W(a, a.return, t);
                  }
                } else if ((22 !== q.tag && 23 !== q.tag || null === q.memoizedState || q === a) && null !== q.child) {
                  q.child.return = q;
                  q = q.child;
                  continue;
                }
                if (q === a) break a;
                for (; null === q.sibling; ) {
                  if (null === q.return || q.return === a) break a;
                  m === q && (m = null);
                  q = q.return;
                }
                m === q && (m = null);
                q.sibling.return = q.return;
                q = q.sibling;
              }
            }
            break;
          case 19:
            ck(b, a);
            ek(a);
            d & 4 && ak(a);
            break;
          case 21:
            break;
          default:
            ck(
              b,
              a
            ), ek(a);
        }
      }
      function ek(a) {
        var b = a.flags;
        if (b & 2) {
          try {
            a: {
              for (var c = a.return; null !== c; ) {
                if (Tj(c)) {
                  var d = c;
                  break a;
                }
                c = c.return;
              }
              throw Error(p(160));
            }
            switch (d.tag) {
              case 5:
                var e = d.stateNode;
                d.flags & 32 && (ob(e, ""), d.flags &= -33);
                var f = Uj(a);
                Wj(a, f, e);
                break;
              case 3:
              case 4:
                var g = d.stateNode.containerInfo, h = Uj(a);
                Vj(a, h, g);
                break;
              default:
                throw Error(p(161));
            }
          } catch (k) {
            W(a, a.return, k);
          }
          a.flags &= -3;
        }
        b & 4096 && (a.flags &= -4097);
      }
      function hk(a, b, c) {
        V = a;
        ik(a);
      }
      function ik(a, b, c) {
        for (var d = 0 !== (a.mode & 1); null !== V; ) {
          var e = V, f = e.child;
          if (22 === e.tag && d) {
            var g = null !== e.memoizedState || Jj;
            if (!g) {
              var h = e.alternate, k = null !== h && null !== h.memoizedState || U;
              h = Jj;
              var l = U;
              Jj = g;
              if ((U = k) && !l) for (V = e; null !== V; ) g = V, k = g.child, 22 === g.tag && null !== g.memoizedState ? jk(e) : null !== k ? (k.return = g, V = k) : jk(e);
              for (; null !== f; ) V = f, ik(f), f = f.sibling;
              V = e;
              Jj = h;
              U = l;
            }
            kk(a);
          } else 0 !== (e.subtreeFlags & 8772) && null !== f ? (f.return = e, V = f) : kk(a);
        }
      }
      function kk(a) {
        for (; null !== V; ) {
          var b = V;
          if (0 !== (b.flags & 8772)) {
            var c = b.alternate;
            try {
              if (0 !== (b.flags & 8772)) switch (b.tag) {
                case 0:
                case 11:
                case 15:
                  U || Qj(5, b);
                  break;
                case 1:
                  var d = b.stateNode;
                  if (b.flags & 4 && !U) if (null === c) d.componentDidMount();
                  else {
                    var e = b.elementType === b.type ? c.memoizedProps : Ci(b.type, c.memoizedProps);
                    d.componentDidUpdate(e, c.memoizedState, d.__reactInternalSnapshotBeforeUpdate);
                  }
                  var f = b.updateQueue;
                  null !== f && sh(b, f, d);
                  break;
                case 3:
                  var g = b.updateQueue;
                  if (null !== g) {
                    c = null;
                    if (null !== b.child) switch (b.child.tag) {
                      case 5:
                        c = b.child.stateNode;
                        break;
                      case 1:
                        c = b.child.stateNode;
                    }
                    sh(b, g, c);
                  }
                  break;
                case 5:
                  var h = b.stateNode;
                  if (null === c && b.flags & 4) {
                    c = h;
                    var k = b.memoizedProps;
                    switch (b.type) {
                      case "button":
                      case "input":
                      case "select":
                      case "textarea":
                        k.autoFocus && c.focus();
                        break;
                      case "img":
                        k.src && (c.src = k.src);
                    }
                  }
                  break;
                case 6:
                  break;
                case 4:
                  break;
                case 12:
                  break;
                case 13:
                  if (null === b.memoizedState) {
                    var l = b.alternate;
                    if (null !== l) {
                      var m = l.memoizedState;
                      if (null !== m) {
                        var q = m.dehydrated;
                        null !== q && bd(q);
                      }
                    }
                  }
                  break;
                case 19:
                case 17:
                case 21:
                case 22:
                case 23:
                case 25:
                  break;
                default:
                  throw Error(p(163));
              }
              U || b.flags & 512 && Rj(b);
            } catch (r) {
              W(b, b.return, r);
            }
          }
          if (b === a) {
            V = null;
            break;
          }
          c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function gk(a) {
        for (; null !== V; ) {
          var b = V;
          if (b === a) {
            V = null;
            break;
          }
          var c = b.sibling;
          if (null !== c) {
            c.return = b.return;
            V = c;
            break;
          }
          V = b.return;
        }
      }
      function jk(a) {
        for (; null !== V; ) {
          var b = V;
          try {
            switch (b.tag) {
              case 0:
              case 11:
              case 15:
                var c = b.return;
                try {
                  Qj(4, b);
                } catch (k) {
                  W(b, c, k);
                }
                break;
              case 1:
                var d = b.stateNode;
                if ("function" === typeof d.componentDidMount) {
                  var e = b.return;
                  try {
                    d.componentDidMount();
                  } catch (k) {
                    W(b, e, k);
                  }
                }
                var f = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, f, k);
                }
                break;
              case 5:
                var g = b.return;
                try {
                  Rj(b);
                } catch (k) {
                  W(b, g, k);
                }
            }
          } catch (k) {
            W(b, b.return, k);
          }
          if (b === a) {
            V = null;
            break;
          }
          var h = b.sibling;
          if (null !== h) {
            h.return = b.return;
            V = h;
            break;
          }
          V = b.return;
        }
      }
      var lk = Math.ceil, mk = ua.ReactCurrentDispatcher, nk = ua.ReactCurrentOwner, ok = ua.ReactCurrentBatchConfig, K = 0, Q = null, Y = null, Z = 0, fj = 0, ej = Uf(0), T = 0, pk = null, rh = 0, qk = 0, rk = 0, sk = null, tk = null, fk = 0, Gj = Infinity, uk = null, Oi = false, Pi = null, Ri = null, vk = false, wk = null, xk = 0, yk = 0, zk = null, Ak = -1, Bk = 0;
      function R() {
        return 0 !== (K & 6) ? B() : -1 !== Ak ? Ak : Ak = B();
      }
      function yi(a) {
        if (0 === (a.mode & 1)) return 1;
        if (0 !== (K & 2) && 0 !== Z) return Z & -Z;
        if (null !== Kg.transition) return 0 === Bk && (Bk = yc()), Bk;
        a = C;
        if (0 !== a) return a;
        a = window.event;
        a = void 0 === a ? 16 : jd(a.type);
        return a;
      }
      function gi(a, b, c, d) {
        if (50 < yk) throw yk = 0, zk = null, Error(p(185));
        Ac(a, c, d);
        if (0 === (K & 2) || a !== Q) a === Q && (0 === (K & 2) && (qk |= c), 4 === T && Ck(a, Z)), Dk(a, d), 1 === c && 0 === K && 0 === (b.mode & 1) && (Gj = B() + 500, fg && jg());
      }
      function Dk(a, b) {
        var c = a.callbackNode;
        wc(a, b);
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d) null !== c && bc(c), a.callbackNode = null, a.callbackPriority = 0;
        else if (b = d & -d, a.callbackPriority !== b) {
          null != c && bc(c);
          if (1 === b) 0 === a.tag ? ig(Ek.bind(null, a)) : hg(Ek.bind(null, a)), Jf(function() {
            0 === (K & 6) && jg();
          }), c = null;
          else {
            switch (Dc(d)) {
              case 1:
                c = fc;
                break;
              case 4:
                c = gc;
                break;
              case 16:
                c = hc;
                break;
              case 536870912:
                c = jc;
                break;
              default:
                c = hc;
            }
            c = Fk(c, Gk.bind(null, a));
          }
          a.callbackPriority = b;
          a.callbackNode = c;
        }
      }
      function Gk(a, b) {
        Ak = -1;
        Bk = 0;
        if (0 !== (K & 6)) throw Error(p(327));
        var c = a.callbackNode;
        if (Hk() && a.callbackNode !== c) return null;
        var d = uc(a, a === Q ? Z : 0);
        if (0 === d) return null;
        if (0 !== (d & 30) || 0 !== (d & a.expiredLanes) || b) b = Ik(a, d);
        else {
          b = d;
          var e = K;
          K |= 2;
          var f = Jk();
          if (Q !== a || Z !== b) uk = null, Gj = B() + 500, Kk(a, b);
          do
            try {
              Lk();
              break;
            } catch (h) {
              Mk(a, h);
            }
          while (1);
          $g();
          mk.current = f;
          K = e;
          null !== Y ? b = 0 : (Q = null, Z = 0, b = T);
        }
        if (0 !== b) {
          2 === b && (e = xc(a), 0 !== e && (d = e, b = Nk(a, e)));
          if (1 === b) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
          if (6 === b) Ck(a, d);
          else {
            e = a.current.alternate;
            if (0 === (d & 30) && !Ok(e) && (b = Ik(a, d), 2 === b && (f = xc(a), 0 !== f && (d = f, b = Nk(a, f))), 1 === b)) throw c = pk, Kk(a, 0), Ck(a, d), Dk(a, B()), c;
            a.finishedWork = e;
            a.finishedLanes = d;
            switch (b) {
              case 0:
              case 1:
                throw Error(p(345));
              case 2:
                Pk(a, tk, uk);
                break;
              case 3:
                Ck(a, d);
                if ((d & 130023424) === d && (b = fk + 500 - B(), 10 < b)) {
                  if (0 !== uc(a, 0)) break;
                  e = a.suspendedLanes;
                  if ((e & d) !== d) {
                    R();
                    a.pingedLanes |= a.suspendedLanes & e;
                    break;
                  }
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), b);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 4:
                Ck(a, d);
                if ((d & 4194240) === d) break;
                b = a.eventTimes;
                for (e = -1; 0 < d; ) {
                  var g = 31 - oc(d);
                  f = 1 << g;
                  g = b[g];
                  g > e && (e = g);
                  d &= ~f;
                }
                d = e;
                d = B() - d;
                d = (120 > d ? 120 : 480 > d ? 480 : 1080 > d ? 1080 : 1920 > d ? 1920 : 3e3 > d ? 3e3 : 4320 > d ? 4320 : 1960 * lk(d / 1960)) - d;
                if (10 < d) {
                  a.timeoutHandle = Ff(Pk.bind(null, a, tk, uk), d);
                  break;
                }
                Pk(a, tk, uk);
                break;
              case 5:
                Pk(a, tk, uk);
                break;
              default:
                throw Error(p(329));
            }
          }
        }
        Dk(a, B());
        return a.callbackNode === c ? Gk.bind(null, a) : null;
      }
      function Nk(a, b) {
        var c = sk;
        a.current.memoizedState.isDehydrated && (Kk(a, b).flags |= 256);
        a = Ik(a, b);
        2 !== a && (b = tk, tk = c, null !== b && Fj(b));
        return a;
      }
      function Fj(a) {
        null === tk ? tk = a : tk.push.apply(tk, a);
      }
      function Ok(a) {
        for (var b = a; ; ) {
          if (b.flags & 16384) {
            var c = b.updateQueue;
            if (null !== c && (c = c.stores, null !== c)) for (var d = 0; d < c.length; d++) {
              var e = c[d], f = e.getSnapshot;
              e = e.value;
              try {
                if (!He(f(), e)) return false;
              } catch (g) {
                return false;
              }
            }
          }
          c = b.child;
          if (b.subtreeFlags & 16384 && null !== c) c.return = b, b = c;
          else {
            if (b === a) break;
            for (; null === b.sibling; ) {
              if (null === b.return || b.return === a) return true;
              b = b.return;
            }
            b.sibling.return = b.return;
            b = b.sibling;
          }
        }
        return true;
      }
      function Ck(a, b) {
        b &= ~rk;
        b &= ~qk;
        a.suspendedLanes |= b;
        a.pingedLanes &= ~b;
        for (a = a.expirationTimes; 0 < b; ) {
          var c = 31 - oc(b), d = 1 << c;
          a[c] = -1;
          b &= ~d;
        }
      }
      function Ek(a) {
        if (0 !== (K & 6)) throw Error(p(327));
        Hk();
        var b = uc(a, 0);
        if (0 === (b & 1)) return Dk(a, B()), null;
        var c = Ik(a, b);
        if (0 !== a.tag && 2 === c) {
          var d = xc(a);
          0 !== d && (b = d, c = Nk(a, d));
        }
        if (1 === c) throw c = pk, Kk(a, 0), Ck(a, b), Dk(a, B()), c;
        if (6 === c) throw Error(p(345));
        a.finishedWork = a.current.alternate;
        a.finishedLanes = b;
        Pk(a, tk, uk);
        Dk(a, B());
        return null;
      }
      function Qk(a, b) {
        var c = K;
        K |= 1;
        try {
          return a(b);
        } finally {
          K = c, 0 === K && (Gj = B() + 500, fg && jg());
        }
      }
      function Rk(a) {
        null !== wk && 0 === wk.tag && 0 === (K & 6) && Hk();
        var b = K;
        K |= 1;
        var c = ok.transition, d = C;
        try {
          if (ok.transition = null, C = 1, a) return a();
        } finally {
          C = d, ok.transition = c, K = b, 0 === (K & 6) && jg();
        }
      }
      function Hj() {
        fj = ej.current;
        E(ej);
      }
      function Kk(a, b) {
        a.finishedWork = null;
        a.finishedLanes = 0;
        var c = a.timeoutHandle;
        -1 !== c && (a.timeoutHandle = -1, Gf(c));
        if (null !== Y) for (c = Y.return; null !== c; ) {
          var d = c;
          wg(d);
          switch (d.tag) {
            case 1:
              d = d.type.childContextTypes;
              null !== d && void 0 !== d && $f();
              break;
            case 3:
              zh();
              E(Wf);
              E(H);
              Eh();
              break;
            case 5:
              Bh(d);
              break;
            case 4:
              zh();
              break;
            case 13:
              E(L);
              break;
            case 19:
              E(L);
              break;
            case 10:
              ah(d.type._context);
              break;
            case 22:
            case 23:
              Hj();
          }
          c = c.return;
        }
        Q = a;
        Y = a = Pg(a.current, null);
        Z = fj = b;
        T = 0;
        pk = null;
        rk = qk = rh = 0;
        tk = sk = null;
        if (null !== fh) {
          for (b = 0; b < fh.length; b++) if (c = fh[b], d = c.interleaved, null !== d) {
            c.interleaved = null;
            var e = d.next, f = c.pending;
            if (null !== f) {
              var g = f.next;
              f.next = e;
              d.next = g;
            }
            c.pending = d;
          }
          fh = null;
        }
        return a;
      }
      function Mk(a, b) {
        do {
          var c = Y;
          try {
            $g();
            Fh.current = Rh;
            if (Ih) {
              for (var d = M.memoizedState; null !== d; ) {
                var e = d.queue;
                null !== e && (e.pending = null);
                d = d.next;
              }
              Ih = false;
            }
            Hh = 0;
            O = N = M = null;
            Jh = false;
            Kh = 0;
            nk.current = null;
            if (null === c || null === c.return) {
              T = 1;
              pk = b;
              Y = null;
              break;
            }
            a: {
              var f = a, g = c.return, h = c, k = b;
              b = Z;
              h.flags |= 32768;
              if (null !== k && "object" === typeof k && "function" === typeof k.then) {
                var l = k, m = h, q = m.tag;
                if (0 === (m.mode & 1) && (0 === q || 11 === q || 15 === q)) {
                  var r = m.alternate;
                  r ? (m.updateQueue = r.updateQueue, m.memoizedState = r.memoizedState, m.lanes = r.lanes) : (m.updateQueue = null, m.memoizedState = null);
                }
                var y = Ui(g);
                if (null !== y) {
                  y.flags &= -257;
                  Vi(y, g, h, f, b);
                  y.mode & 1 && Si(f, l, b);
                  b = y;
                  k = l;
                  var n = b.updateQueue;
                  if (null === n) {
                    var t = /* @__PURE__ */ new Set();
                    t.add(k);
                    b.updateQueue = t;
                  } else n.add(k);
                  break a;
                } else {
                  if (0 === (b & 1)) {
                    Si(f, l, b);
                    tj();
                    break a;
                  }
                  k = Error(p(426));
                }
              } else if (I && h.mode & 1) {
                var J = Ui(g);
                if (null !== J) {
                  0 === (J.flags & 65536) && (J.flags |= 256);
                  Vi(J, g, h, f, b);
                  Jg(Ji(k, h));
                  break a;
                }
              }
              f = k = Ji(k, h);
              4 !== T && (T = 2);
              null === sk ? sk = [f] : sk.push(f);
              f = g;
              do {
                switch (f.tag) {
                  case 3:
                    f.flags |= 65536;
                    b &= -b;
                    f.lanes |= b;
                    var x = Ni(f, k, b);
                    ph(f, x);
                    break a;
                  case 1:
                    h = k;
                    var w = f.type, u = f.stateNode;
                    if (0 === (f.flags & 128) && ("function" === typeof w.getDerivedStateFromError || null !== u && "function" === typeof u.componentDidCatch && (null === Ri || !Ri.has(u)))) {
                      f.flags |= 65536;
                      b &= -b;
                      f.lanes |= b;
                      var F = Qi(f, h, b);
                      ph(f, F);
                      break a;
                    }
                }
                f = f.return;
              } while (null !== f);
            }
            Sk(c);
          } catch (na) {
            b = na;
            Y === c && null !== c && (Y = c = c.return);
            continue;
          }
          break;
        } while (1);
      }
      function Jk() {
        var a = mk.current;
        mk.current = Rh;
        return null === a ? Rh : a;
      }
      function tj() {
        if (0 === T || 3 === T || 2 === T) T = 4;
        null === Q || 0 === (rh & 268435455) && 0 === (qk & 268435455) || Ck(Q, Z);
      }
      function Ik(a, b) {
        var c = K;
        K |= 2;
        var d = Jk();
        if (Q !== a || Z !== b) uk = null, Kk(a, b);
        do
          try {
            Tk();
            break;
          } catch (e) {
            Mk(a, e);
          }
        while (1);
        $g();
        K = c;
        mk.current = d;
        if (null !== Y) throw Error(p(261));
        Q = null;
        Z = 0;
        return T;
      }
      function Tk() {
        for (; null !== Y; ) Uk(Y);
      }
      function Lk() {
        for (; null !== Y && !cc(); ) Uk(Y);
      }
      function Uk(a) {
        var b = Vk(a.alternate, a, fj);
        a.memoizedProps = a.pendingProps;
        null === b ? Sk(a) : Y = b;
        nk.current = null;
      }
      function Sk(a) {
        var b = a;
        do {
          var c = b.alternate;
          a = b.return;
          if (0 === (b.flags & 32768)) {
            if (c = Ej(c, b, fj), null !== c) {
              Y = c;
              return;
            }
          } else {
            c = Ij(c, b);
            if (null !== c) {
              c.flags &= 32767;
              Y = c;
              return;
            }
            if (null !== a) a.flags |= 32768, a.subtreeFlags = 0, a.deletions = null;
            else {
              T = 6;
              Y = null;
              return;
            }
          }
          b = b.sibling;
          if (null !== b) {
            Y = b;
            return;
          }
          Y = b = a;
        } while (null !== b);
        0 === T && (T = 5);
      }
      function Pk(a, b, c) {
        var d = C, e = ok.transition;
        try {
          ok.transition = null, C = 1, Wk(a, b, c, d);
        } finally {
          ok.transition = e, C = d;
        }
        return null;
      }
      function Wk(a, b, c, d) {
        do
          Hk();
        while (null !== wk);
        if (0 !== (K & 6)) throw Error(p(327));
        c = a.finishedWork;
        var e = a.finishedLanes;
        if (null === c) return null;
        a.finishedWork = null;
        a.finishedLanes = 0;
        if (c === a.current) throw Error(p(177));
        a.callbackNode = null;
        a.callbackPriority = 0;
        var f = c.lanes | c.childLanes;
        Bc(a, f);
        a === Q && (Y = Q = null, Z = 0);
        0 === (c.subtreeFlags & 2064) && 0 === (c.flags & 2064) || vk || (vk = true, Fk(hc, function() {
          Hk();
          return null;
        }));
        f = 0 !== (c.flags & 15990);
        if (0 !== (c.subtreeFlags & 15990) || f) {
          f = ok.transition;
          ok.transition = null;
          var g = C;
          C = 1;
          var h = K;
          K |= 4;
          nk.current = null;
          Oj(a, c);
          dk(c, a);
          Oe(Df);
          dd = !!Cf;
          Df = Cf = null;
          a.current = c;
          hk(c);
          dc();
          K = h;
          C = g;
          ok.transition = f;
        } else a.current = c;
        vk && (vk = false, wk = a, xk = e);
        f = a.pendingLanes;
        0 === f && (Ri = null);
        mc(c.stateNode);
        Dk(a, B());
        if (null !== b) for (d = a.onRecoverableError, c = 0; c < b.length; c++) e = b[c], d(e.value, { componentStack: e.stack, digest: e.digest });
        if (Oi) throw Oi = false, a = Pi, Pi = null, a;
        0 !== (xk & 1) && 0 !== a.tag && Hk();
        f = a.pendingLanes;
        0 !== (f & 1) ? a === zk ? yk++ : (yk = 0, zk = a) : yk = 0;
        jg();
        return null;
      }
      function Hk() {
        if (null !== wk) {
          var a = Dc(xk), b = ok.transition, c = C;
          try {
            ok.transition = null;
            C = 16 > a ? 16 : a;
            if (null === wk) var d = false;
            else {
              a = wk;
              wk = null;
              xk = 0;
              if (0 !== (K & 6)) throw Error(p(331));
              var e = K;
              K |= 4;
              for (V = a.current; null !== V; ) {
                var f = V, g = f.child;
                if (0 !== (V.flags & 16)) {
                  var h = f.deletions;
                  if (null !== h) {
                    for (var k = 0; k < h.length; k++) {
                      var l = h[k];
                      for (V = l; null !== V; ) {
                        var m = V;
                        switch (m.tag) {
                          case 0:
                          case 11:
                          case 15:
                            Pj(8, m, f);
                        }
                        var q = m.child;
                        if (null !== q) q.return = m, V = q;
                        else for (; null !== V; ) {
                          m = V;
                          var r = m.sibling, y = m.return;
                          Sj(m);
                          if (m === l) {
                            V = null;
                            break;
                          }
                          if (null !== r) {
                            r.return = y;
                            V = r;
                            break;
                          }
                          V = y;
                        }
                      }
                    }
                    var n = f.alternate;
                    if (null !== n) {
                      var t = n.child;
                      if (null !== t) {
                        n.child = null;
                        do {
                          var J = t.sibling;
                          t.sibling = null;
                          t = J;
                        } while (null !== t);
                      }
                    }
                    V = f;
                  }
                }
                if (0 !== (f.subtreeFlags & 2064) && null !== g) g.return = f, V = g;
                else b: for (; null !== V; ) {
                  f = V;
                  if (0 !== (f.flags & 2048)) switch (f.tag) {
                    case 0:
                    case 11:
                    case 15:
                      Pj(9, f, f.return);
                  }
                  var x = f.sibling;
                  if (null !== x) {
                    x.return = f.return;
                    V = x;
                    break b;
                  }
                  V = f.return;
                }
              }
              var w = a.current;
              for (V = w; null !== V; ) {
                g = V;
                var u = g.child;
                if (0 !== (g.subtreeFlags & 2064) && null !== u) u.return = g, V = u;
                else b: for (g = w; null !== V; ) {
                  h = V;
                  if (0 !== (h.flags & 2048)) try {
                    switch (h.tag) {
                      case 0:
                      case 11:
                      case 15:
                        Qj(9, h);
                    }
                  } catch (na) {
                    W(h, h.return, na);
                  }
                  if (h === g) {
                    V = null;
                    break b;
                  }
                  var F = h.sibling;
                  if (null !== F) {
                    F.return = h.return;
                    V = F;
                    break b;
                  }
                  V = h.return;
                }
              }
              K = e;
              jg();
              if (lc && "function" === typeof lc.onPostCommitFiberRoot) try {
                lc.onPostCommitFiberRoot(kc, a);
              } catch (na) {
              }
              d = true;
            }
            return d;
          } finally {
            C = c, ok.transition = b;
          }
        }
        return false;
      }
      function Xk(a, b, c) {
        b = Ji(c, b);
        b = Ni(a, b, 1);
        a = nh(a, b, 1);
        b = R();
        null !== a && (Ac(a, 1, b), Dk(a, b));
      }
      function W(a, b, c) {
        if (3 === a.tag) Xk(a, a, c);
        else for (; null !== b; ) {
          if (3 === b.tag) {
            Xk(b, a, c);
            break;
          } else if (1 === b.tag) {
            var d = b.stateNode;
            if ("function" === typeof b.type.getDerivedStateFromError || "function" === typeof d.componentDidCatch && (null === Ri || !Ri.has(d))) {
              a = Ji(c, a);
              a = Qi(b, a, 1);
              b = nh(b, a, 1);
              a = R();
              null !== b && (Ac(b, 1, a), Dk(b, a));
              break;
            }
          }
          b = b.return;
        }
      }
      function Ti(a, b, c) {
        var d = a.pingCache;
        null !== d && d.delete(b);
        b = R();
        a.pingedLanes |= a.suspendedLanes & c;
        Q === a && (Z & c) === c && (4 === T || 3 === T && (Z & 130023424) === Z && 500 > B() - fk ? Kk(a, 0) : rk |= c);
        Dk(a, b);
      }
      function Yk(a, b) {
        0 === b && (0 === (a.mode & 1) ? b = 1 : (b = sc, sc <<= 1, 0 === (sc & 130023424) && (sc = 4194304)));
        var c = R();
        a = ih(a, b);
        null !== a && (Ac(a, b, c), Dk(a, c));
      }
      function uj(a) {
        var b = a.memoizedState, c = 0;
        null !== b && (c = b.retryLane);
        Yk(a, c);
      }
      function bk(a, b) {
        var c = 0;
        switch (a.tag) {
          case 13:
            var d = a.stateNode;
            var e = a.memoizedState;
            null !== e && (c = e.retryLane);
            break;
          case 19:
            d = a.stateNode;
            break;
          default:
            throw Error(p(314));
        }
        null !== d && d.delete(b);
        Yk(a, c);
      }
      var Vk;
      Vk = function(a, b, c) {
        if (null !== a) if (a.memoizedProps !== b.pendingProps || Wf.current) dh = true;
        else {
          if (0 === (a.lanes & c) && 0 === (b.flags & 128)) return dh = false, yj(a, b, c);
          dh = 0 !== (a.flags & 131072) ? true : false;
        }
        else dh = false, I && 0 !== (b.flags & 1048576) && ug(b, ng, b.index);
        b.lanes = 0;
        switch (b.tag) {
          case 2:
            var d = b.type;
            ij(a, b);
            a = b.pendingProps;
            var e = Yf(b, H.current);
            ch(b, c);
            e = Nh(null, b, d, a, e, c);
            var f = Sh();
            b.flags |= 1;
            "object" === typeof e && null !== e && "function" === typeof e.render && void 0 === e.$$typeof ? (b.tag = 1, b.memoizedState = null, b.updateQueue = null, Zf(d) ? (f = true, cg(b)) : f = false, b.memoizedState = null !== e.state && void 0 !== e.state ? e.state : null, kh(b), e.updater = Ei, b.stateNode = e, e._reactInternals = b, Ii(b, d, a, c), b = jj(null, b, d, true, f, c)) : (b.tag = 0, I && f && vg(b), Xi(null, b, e, c), b = b.child);
            return b;
          case 16:
            d = b.elementType;
            a: {
              ij(a, b);
              a = b.pendingProps;
              e = d._init;
              d = e(d._payload);
              b.type = d;
              e = b.tag = Zk(d);
              a = Ci(d, a);
              switch (e) {
                case 0:
                  b = cj(null, b, d, a, c);
                  break a;
                case 1:
                  b = hj(null, b, d, a, c);
                  break a;
                case 11:
                  b = Yi(null, b, d, a, c);
                  break a;
                case 14:
                  b = $i(null, b, d, Ci(d.type, a), c);
                  break a;
              }
              throw Error(p(
                306,
                d,
                ""
              ));
            }
            return b;
          case 0:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), cj(a, b, d, e, c);
          case 1:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), hj(a, b, d, e, c);
          case 3:
            a: {
              kj(b);
              if (null === a) throw Error(p(387));
              d = b.pendingProps;
              f = b.memoizedState;
              e = f.element;
              lh(a, b);
              qh(b, d, null, c);
              var g = b.memoizedState;
              d = g.element;
              if (f.isDehydrated) if (f = { element: d, isDehydrated: false, cache: g.cache, pendingSuspenseBoundaries: g.pendingSuspenseBoundaries, transitions: g.transitions }, b.updateQueue.baseState = f, b.memoizedState = f, b.flags & 256) {
                e = Ji(Error(p(423)), b);
                b = lj(a, b, d, c, e);
                break a;
              } else if (d !== e) {
                e = Ji(Error(p(424)), b);
                b = lj(a, b, d, c, e);
                break a;
              } else for (yg = Lf(b.stateNode.containerInfo.firstChild), xg = b, I = true, zg = null, c = Vg(b, null, d, c), b.child = c; c; ) c.flags = c.flags & -3 | 4096, c = c.sibling;
              else {
                Ig();
                if (d === e) {
                  b = Zi(a, b, c);
                  break a;
                }
                Xi(a, b, d, c);
              }
              b = b.child;
            }
            return b;
          case 5:
            return Ah(b), null === a && Eg(b), d = b.type, e = b.pendingProps, f = null !== a ? a.memoizedProps : null, g = e.children, Ef(d, e) ? g = null : null !== f && Ef(d, f) && (b.flags |= 32), gj(a, b), Xi(a, b, g, c), b.child;
          case 6:
            return null === a && Eg(b), null;
          case 13:
            return oj(a, b, c);
          case 4:
            return yh(b, b.stateNode.containerInfo), d = b.pendingProps, null === a ? b.child = Ug(b, null, d, c) : Xi(a, b, d, c), b.child;
          case 11:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), Yi(a, b, d, e, c);
          case 7:
            return Xi(a, b, b.pendingProps, c), b.child;
          case 8:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 12:
            return Xi(a, b, b.pendingProps.children, c), b.child;
          case 10:
            a: {
              d = b.type._context;
              e = b.pendingProps;
              f = b.memoizedProps;
              g = e.value;
              G(Wg, d._currentValue);
              d._currentValue = g;
              if (null !== f) if (He(f.value, g)) {
                if (f.children === e.children && !Wf.current) {
                  b = Zi(a, b, c);
                  break a;
                }
              } else for (f = b.child, null !== f && (f.return = b); null !== f; ) {
                var h = f.dependencies;
                if (null !== h) {
                  g = f.child;
                  for (var k = h.firstContext; null !== k; ) {
                    if (k.context === d) {
                      if (1 === f.tag) {
                        k = mh(-1, c & -c);
                        k.tag = 2;
                        var l = f.updateQueue;
                        if (null !== l) {
                          l = l.shared;
                          var m = l.pending;
                          null === m ? k.next = k : (k.next = m.next, m.next = k);
                          l.pending = k;
                        }
                      }
                      f.lanes |= c;
                      k = f.alternate;
                      null !== k && (k.lanes |= c);
                      bh(
                        f.return,
                        c,
                        b
                      );
                      h.lanes |= c;
                      break;
                    }
                    k = k.next;
                  }
                } else if (10 === f.tag) g = f.type === b.type ? null : f.child;
                else if (18 === f.tag) {
                  g = f.return;
                  if (null === g) throw Error(p(341));
                  g.lanes |= c;
                  h = g.alternate;
                  null !== h && (h.lanes |= c);
                  bh(g, c, b);
                  g = f.sibling;
                } else g = f.child;
                if (null !== g) g.return = f;
                else for (g = f; null !== g; ) {
                  if (g === b) {
                    g = null;
                    break;
                  }
                  f = g.sibling;
                  if (null !== f) {
                    f.return = g.return;
                    g = f;
                    break;
                  }
                  g = g.return;
                }
                f = g;
              }
              Xi(a, b, e.children, c);
              b = b.child;
            }
            return b;
          case 9:
            return e = b.type, d = b.pendingProps.children, ch(b, c), e = eh(e), d = d(e), b.flags |= 1, Xi(a, b, d, c), b.child;
          case 14:
            return d = b.type, e = Ci(d, b.pendingProps), e = Ci(d.type, e), $i(a, b, d, e, c);
          case 15:
            return bj(a, b, b.type, b.pendingProps, c);
          case 17:
            return d = b.type, e = b.pendingProps, e = b.elementType === d ? e : Ci(d, e), ij(a, b), b.tag = 1, Zf(d) ? (a = true, cg(b)) : a = false, ch(b, c), Gi(b, d, e), Ii(b, d, e, c), jj(null, b, d, true, a, c);
          case 19:
            return xj(a, b, c);
          case 22:
            return dj(a, b, c);
        }
        throw Error(p(156, b.tag));
      };
      function Fk(a, b) {
        return ac(a, b);
      }
      function $k(a, b, c, d) {
        this.tag = a;
        this.key = c;
        this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
        this.index = 0;
        this.ref = null;
        this.pendingProps = b;
        this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
        this.mode = d;
        this.subtreeFlags = this.flags = 0;
        this.deletions = null;
        this.childLanes = this.lanes = 0;
        this.alternate = null;
      }
      function Bg(a, b, c, d) {
        return new $k(a, b, c, d);
      }
      function aj(a) {
        a = a.prototype;
        return !(!a || !a.isReactComponent);
      }
      function Zk(a) {
        if ("function" === typeof a) return aj(a) ? 1 : 0;
        if (void 0 !== a && null !== a) {
          a = a.$$typeof;
          if (a === Da) return 11;
          if (a === Ga) return 14;
        }
        return 2;
      }
      function Pg(a, b) {
        var c = a.alternate;
        null === c ? (c = Bg(a.tag, b, a.key, a.mode), c.elementType = a.elementType, c.type = a.type, c.stateNode = a.stateNode, c.alternate = a, a.alternate = c) : (c.pendingProps = b, c.type = a.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null);
        c.flags = a.flags & 14680064;
        c.childLanes = a.childLanes;
        c.lanes = a.lanes;
        c.child = a.child;
        c.memoizedProps = a.memoizedProps;
        c.memoizedState = a.memoizedState;
        c.updateQueue = a.updateQueue;
        b = a.dependencies;
        c.dependencies = null === b ? null : { lanes: b.lanes, firstContext: b.firstContext };
        c.sibling = a.sibling;
        c.index = a.index;
        c.ref = a.ref;
        return c;
      }
      function Rg(a, b, c, d, e, f) {
        var g = 2;
        d = a;
        if ("function" === typeof a) aj(a) && (g = 1);
        else if ("string" === typeof a) g = 5;
        else a: switch (a) {
          case ya:
            return Tg(c.children, e, f, b);
          case za:
            g = 8;
            e |= 8;
            break;
          case Aa:
            return a = Bg(12, c, b, e | 2), a.elementType = Aa, a.lanes = f, a;
          case Ea:
            return a = Bg(13, c, b, e), a.elementType = Ea, a.lanes = f, a;
          case Fa:
            return a = Bg(19, c, b, e), a.elementType = Fa, a.lanes = f, a;
          case Ia:
            return pj(c, e, f, b);
          default:
            if ("object" === typeof a && null !== a) switch (a.$$typeof) {
              case Ba:
                g = 10;
                break a;
              case Ca:
                g = 9;
                break a;
              case Da:
                g = 11;
                break a;
              case Ga:
                g = 14;
                break a;
              case Ha:
                g = 16;
                d = null;
                break a;
            }
            throw Error(p(130, null == a ? a : typeof a, ""));
        }
        b = Bg(g, c, b, e);
        b.elementType = a;
        b.type = d;
        b.lanes = f;
        return b;
      }
      function Tg(a, b, c, d) {
        a = Bg(7, a, d, b);
        a.lanes = c;
        return a;
      }
      function pj(a, b, c, d) {
        a = Bg(22, a, d, b);
        a.elementType = Ia;
        a.lanes = c;
        a.stateNode = { isHidden: false };
        return a;
      }
      function Qg(a, b, c) {
        a = Bg(6, a, null, b);
        a.lanes = c;
        return a;
      }
      function Sg(a, b, c) {
        b = Bg(4, null !== a.children ? a.children : [], a.key, b);
        b.lanes = c;
        b.stateNode = { containerInfo: a.containerInfo, pendingChildren: null, implementation: a.implementation };
        return b;
      }
      function al(a, b, c, d, e) {
        this.tag = b;
        this.containerInfo = a;
        this.finishedWork = this.pingCache = this.current = this.pendingChildren = null;
        this.timeoutHandle = -1;
        this.callbackNode = this.pendingContext = this.context = null;
        this.callbackPriority = 0;
        this.eventTimes = zc(0);
        this.expirationTimes = zc(-1);
        this.entangledLanes = this.finishedLanes = this.mutableReadLanes = this.expiredLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
        this.entanglements = zc(0);
        this.identifierPrefix = d;
        this.onRecoverableError = e;
        this.mutableSourceEagerHydrationData = null;
      }
      function bl(a, b, c, d, e, f, g, h, k) {
        a = new al(a, b, c, h, k);
        1 === b ? (b = 1, true === f && (b |= 8)) : b = 0;
        f = Bg(3, null, null, b);
        a.current = f;
        f.stateNode = a;
        f.memoizedState = { element: d, isDehydrated: c, cache: null, transitions: null, pendingSuspenseBoundaries: null };
        kh(f);
        return a;
      }
      function cl(a, b, c) {
        var d = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
        return { $$typeof: wa, key: null == d ? null : "" + d, children: a, containerInfo: b, implementation: c };
      }
      function dl(a) {
        if (!a) return Vf;
        a = a._reactInternals;
        a: {
          if (Vb(a) !== a || 1 !== a.tag) throw Error(p(170));
          var b = a;
          do {
            switch (b.tag) {
              case 3:
                b = b.stateNode.context;
                break a;
              case 1:
                if (Zf(b.type)) {
                  b = b.stateNode.__reactInternalMemoizedMergedChildContext;
                  break a;
                }
            }
            b = b.return;
          } while (null !== b);
          throw Error(p(171));
        }
        if (1 === a.tag) {
          var c = a.type;
          if (Zf(c)) return bg(a, c, b);
        }
        return b;
      }
      function el(a, b, c, d, e, f, g, h, k) {
        a = bl(c, d, true, a, e, f, g, h, k);
        a.context = dl(null);
        c = a.current;
        d = R();
        e = yi(c);
        f = mh(d, e);
        f.callback = void 0 !== b && null !== b ? b : null;
        nh(c, f, e);
        a.current.lanes = e;
        Ac(a, e, d);
        Dk(a, d);
        return a;
      }
      function fl(a, b, c, d) {
        var e = b.current, f = R(), g = yi(e);
        c = dl(c);
        null === b.context ? b.context = c : b.pendingContext = c;
        b = mh(f, g);
        b.payload = { element: a };
        d = void 0 === d ? null : d;
        null !== d && (b.callback = d);
        a = nh(e, b, g);
        null !== a && (gi(a, e, g, f), oh(a, e, g));
        return g;
      }
      function gl(a) {
        a = a.current;
        if (!a.child) return null;
        switch (a.child.tag) {
          case 5:
            return a.child.stateNode;
          default:
            return a.child.stateNode;
        }
      }
      function hl(a, b) {
        a = a.memoizedState;
        if (null !== a && null !== a.dehydrated) {
          var c = a.retryLane;
          a.retryLane = 0 !== c && c < b ? c : b;
        }
      }
      function il(a, b) {
        hl(a, b);
        (a = a.alternate) && hl(a, b);
      }
      function jl() {
        return null;
      }
      var kl = "function" === typeof reportError ? reportError : function(a) {
        console.error(a);
      };
      function ll(a) {
        this._internalRoot = a;
      }
      ml.prototype.render = ll.prototype.render = function(a) {
        var b = this._internalRoot;
        if (null === b) throw Error(p(409));
        fl(a, b, null, null);
      };
      ml.prototype.unmount = ll.prototype.unmount = function() {
        var a = this._internalRoot;
        if (null !== a) {
          this._internalRoot = null;
          var b = a.containerInfo;
          Rk(function() {
            fl(null, a, null, null);
          });
          b[uf] = null;
        }
      };
      function ml(a) {
        this._internalRoot = a;
      }
      ml.prototype.unstable_scheduleHydration = function(a) {
        if (a) {
          var b = Hc();
          a = { blockedOn: null, target: a, priority: b };
          for (var c = 0; c < Qc.length && 0 !== b && b < Qc[c].priority; c++) ;
          Qc.splice(c, 0, a);
          0 === c && Vc(a);
        }
      };
      function nl(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType);
      }
      function ol(a) {
        return !(!a || 1 !== a.nodeType && 9 !== a.nodeType && 11 !== a.nodeType && (8 !== a.nodeType || " react-mount-point-unstable " !== a.nodeValue));
      }
      function pl() {
      }
      function ql(a, b, c, d, e) {
        if (e) {
          if ("function" === typeof d) {
            var f = d;
            d = function() {
              var a2 = gl(g);
              f.call(a2);
            };
          }
          var g = el(b, d, a, 0, null, false, false, "", pl);
          a._reactRootContainer = g;
          a[uf] = g.current;
          sf(8 === a.nodeType ? a.parentNode : a);
          Rk();
          return g;
        }
        for (; e = a.lastChild; ) a.removeChild(e);
        if ("function" === typeof d) {
          var h = d;
          d = function() {
            var a2 = gl(k);
            h.call(a2);
          };
        }
        var k = bl(a, 0, false, null, null, false, false, "", pl);
        a._reactRootContainer = k;
        a[uf] = k.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        Rk(function() {
          fl(b, k, c, d);
        });
        return k;
      }
      function rl(a, b, c, d, e) {
        var f = c._reactRootContainer;
        if (f) {
          var g = f;
          if ("function" === typeof e) {
            var h = e;
            e = function() {
              var a2 = gl(g);
              h.call(a2);
            };
          }
          fl(b, g, a, e);
        } else g = ql(c, b, a, e, d);
        return gl(g);
      }
      Ec = function(a) {
        switch (a.tag) {
          case 3:
            var b = a.stateNode;
            if (b.current.memoizedState.isDehydrated) {
              var c = tc(b.pendingLanes);
              0 !== c && (Cc(b, c | 1), Dk(b, B()), 0 === (K & 6) && (Gj = B() + 500, jg()));
            }
            break;
          case 13:
            Rk(function() {
              var b2 = ih(a, 1);
              if (null !== b2) {
                var c2 = R();
                gi(b2, a, 1, c2);
              }
            }), il(a, 1);
        }
      };
      Fc = function(a) {
        if (13 === a.tag) {
          var b = ih(a, 134217728);
          if (null !== b) {
            var c = R();
            gi(b, a, 134217728, c);
          }
          il(a, 134217728);
        }
      };
      Gc = function(a) {
        if (13 === a.tag) {
          var b = yi(a), c = ih(a, b);
          if (null !== c) {
            var d = R();
            gi(c, a, b, d);
          }
          il(a, b);
        }
      };
      Hc = function() {
        return C;
      };
      Ic = function(a, b) {
        var c = C;
        try {
          return C = a, b();
        } finally {
          C = c;
        }
      };
      yb = function(a, b, c) {
        switch (b) {
          case "input":
            bb(a, c);
            b = c.name;
            if ("radio" === c.type && null != b) {
              for (c = a; c.parentNode; ) c = c.parentNode;
              c = c.querySelectorAll("input[name=" + JSON.stringify("" + b) + '][type="radio"]');
              for (b = 0; b < c.length; b++) {
                var d = c[b];
                if (d !== a && d.form === a.form) {
                  var e = Db(d);
                  if (!e) throw Error(p(90));
                  Wa(d);
                  bb(d, e);
                }
              }
            }
            break;
          case "textarea":
            ib(a, c);
            break;
          case "select":
            b = c.value, null != b && fb(a, !!c.multiple, b, false);
        }
      };
      Gb = Qk;
      Hb = Rk;
      var sl = { usingClientEntryPoint: false, Events: [Cb, ue, Db, Eb, Fb, Qk] }, tl = { findFiberByHostInstance: Wc, bundleType: 0, version: "18.3.1", rendererPackageName: "react-dom" };
      var ul = { bundleType: tl.bundleType, version: tl.version, rendererPackageName: tl.rendererPackageName, rendererConfig: tl.rendererConfig, overrideHookState: null, overrideHookStateDeletePath: null, overrideHookStateRenamePath: null, overrideProps: null, overridePropsDeletePath: null, overridePropsRenamePath: null, setErrorHandler: null, setSuspenseHandler: null, scheduleUpdate: null, currentDispatcherRef: ua.ReactCurrentDispatcher, findHostInstanceByFiber: function(a) {
        a = Zb(a);
        return null === a ? null : a.stateNode;
      }, findFiberByHostInstance: tl.findFiberByHostInstance || jl, findHostInstancesForRefresh: null, scheduleRefresh: null, scheduleRoot: null, setRefreshHandler: null, getCurrentFiber: null, reconcilerVersion: "18.3.1-next-f1338f8080-20240426" };
      if ("undefined" !== typeof __REACT_DEVTOOLS_GLOBAL_HOOK__) {
        var vl = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!vl.isDisabled && vl.supportsFiber) try {
          kc = vl.inject(ul), lc = vl;
        } catch (a) {
        }
      }
      reactDom_production_min.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = sl;
      reactDom_production_min.createPortal = function(a, b) {
        var c = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
        if (!nl(b)) throw Error(p(200));
        return cl(a, b, null, c);
      };
      reactDom_production_min.createRoot = function(a, b) {
        if (!nl(a)) throw Error(p(299));
        var c = false, d = "", e = kl;
        null !== b && void 0 !== b && (true === b.unstable_strictMode && (c = true), void 0 !== b.identifierPrefix && (d = b.identifierPrefix), void 0 !== b.onRecoverableError && (e = b.onRecoverableError));
        b = bl(a, 1, false, null, null, c, false, d, e);
        a[uf] = b.current;
        sf(8 === a.nodeType ? a.parentNode : a);
        return new ll(b);
      };
      reactDom_production_min.findDOMNode = function(a) {
        if (null == a) return null;
        if (1 === a.nodeType) return a;
        var b = a._reactInternals;
        if (void 0 === b) {
          if ("function" === typeof a.render) throw Error(p(188));
          a = Object.keys(a).join(",");
          throw Error(p(268, a));
        }
        a = Zb(b);
        a = null === a ? null : a.stateNode;
        return a;
      };
      reactDom_production_min.flushSync = function(a) {
        return Rk(a);
      };
      reactDom_production_min.hydrate = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, true, c);
      };
      reactDom_production_min.hydrateRoot = function(a, b, c) {
        if (!nl(a)) throw Error(p(405));
        var d = null != c && c.hydratedSources || null, e = false, f = "", g = kl;
        null !== c && void 0 !== c && (true === c.unstable_strictMode && (e = true), void 0 !== c.identifierPrefix && (f = c.identifierPrefix), void 0 !== c.onRecoverableError && (g = c.onRecoverableError));
        b = el(b, null, a, 1, null != c ? c : null, e, false, f, g);
        a[uf] = b.current;
        sf(a);
        if (d) for (a = 0; a < d.length; a++) c = d[a], e = c._getVersion, e = e(c._source), null == b.mutableSourceEagerHydrationData ? b.mutableSourceEagerHydrationData = [c, e] : b.mutableSourceEagerHydrationData.push(
          c,
          e
        );
        return new ml(b);
      };
      reactDom_production_min.render = function(a, b, c) {
        if (!ol(b)) throw Error(p(200));
        return rl(null, a, b, false, c);
      };
      reactDom_production_min.unmountComponentAtNode = function(a) {
        if (!ol(a)) throw Error(p(40));
        return a._reactRootContainer ? (Rk(function() {
          rl(null, null, a, false, function() {
            a._reactRootContainer = null;
            a[uf] = null;
          });
        }), true) : false;
      };
      reactDom_production_min.unstable_batchedUpdates = Qk;
      reactDom_production_min.unstable_renderSubtreeIntoContainer = function(a, b, c, d) {
        if (!ol(c)) throw Error(p(200));
        if (null == a || void 0 === a._reactInternals) throw Error(p(38));
        return rl(a, b, c, false, d);
      };
      reactDom_production_min.version = "18.3.1-next-f1338f8080-20240426";
      return reactDom_production_min;
    }
    var hasRequiredReactDom;
    function requireReactDom() {
      if (hasRequiredReactDom) return reactDom.exports;
      hasRequiredReactDom = 1;
      function checkDCE() {
        if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
          return;
        }
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
        } catch (err) {
          console.error(err);
        }
      }
      {
        checkDCE();
        reactDom.exports = requireReactDom_production_min();
      }
      return reactDom.exports;
    }
    var hasRequiredClient;
    function requireClient() {
      if (hasRequiredClient) return client;
      hasRequiredClient = 1;
      var m = requireReactDom();
      {
        client.createRoot = m.createRoot;
        client.hydrateRoot = m.hydrateRoot;
      }
      return client;
    }
    var clientExports = requireClient();
    const ConfigContext = reactExports.createContext();
    const getConfigContext = () => ConfigContext;
    const ConfigProvider = ({ children }) => {
      var _a, _b;
      const [config, setConfig] = reactExports.useState(null);
      const [loading, setLoading] = reactExports.useState(true);
      const [error, setError] = reactExports.useState(null);
      const configMetadata = reactExports.useRef({
        etag: null,
        lastModified: null,
        lastCheck: null,
        tenantHash: null
      });
      reactExports.useRef(null);
      const getTenantHash = () => {
        var _a2;
        try {
          const script = document.querySelector('script[src*="widget.js"]');
          const rawHash = (script == null ? void 0 : script.getAttribute("data-tenant")) || "";
          const tenantHash = rawHash.replace(/\.js$/, "");
          if (tenantHash && tenantHash !== "undefined" && tenantHash.length >= 8) {
            console.log("✅ Found tenant hash from script:", tenantHash.slice(0, 8) + "...");
            return tenantHash;
          }
          const urlParams = new URLSearchParams(window.location.search);
          const urlTenant = urlParams.get("t");
          if (urlTenant && urlTenant !== "undefined" && urlTenant.length >= 8) {
            console.log("✅ Found tenant hash from URL:", urlTenant.slice(0, 8) + "...");
            return urlTenant;
          }
          if (((_a2 = window.PicassoConfig) == null ? void 0 : _a2.tenant) && window.PicassoConfig.tenant !== "undefined") {
            console.log("✅ Found tenant hash from PicassoConfig:", window.PicassoConfig.tenant.slice(0, 8) + "...");
            return window.PicassoConfig.tenant;
          }
          console.warn("⚠️ No valid tenant hash found, widget initialization failed");
          return null;
        } catch (error2) {
          console.warn("Hash extraction failed:", error2);
          return null;
        }
      };
      const fetchConfigWithCacheCheck = (tenantHash, force = false) => __async(null, null, function* () {
        try {
          const configUrl = `https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${encodeURIComponent(tenantHash)}`;
          const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
          };
          if (!force && configMetadata.current.etag) {
            headers["If-None-Match"] = configMetadata.current.etag;
          }
          if (!force && configMetadata.current.lastModified) {
            headers["If-Modified-Since"] = configMetadata.current.lastModified;
          }
          console.log(`🔄 Fetching config via NEW hash + action system`, {
            hash: tenantHash.slice(0, 8) + "...",
            force,
            hasETag: !!configMetadata.current.etag,
            url: configUrl
          });
          const response = yield fetch(configUrl, {
            method: "GET",
            headers,
            mode: "cors",
            credentials: "omit",
            cache: "no-cache"
          });
          configMetadata.current.lastCheck = (/* @__PURE__ */ new Date()).toISOString();
          console.log("📡 Response status:", response.status);
          if (response.status === 304) {
            console.log("✅ Config unchanged (304 Not Modified)");
            return { unchanged: true };
          }
          if (!response.ok) {
            const errorText = yield response.text();
            console.error("❌ Response error:", errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
          }
          const newConfig = yield response.json();
          configMetadata.current.etag = response.headers.get("etag");
          configMetadata.current.lastModified = response.headers.get("last-modified");
          configMetadata.current.tenantHash = tenantHash;
          console.log("✅ Config loaded successfully via NEW hash + action system", {
            hash: tenantHash.slice(0, 8) + "...",
            chatTitle: newConfig.chat_title,
            hasBranding: !!newConfig.branding,
            hasFeatures: !!newConfig.features,
            responseTime: "immediate"
          });
          return { config: newConfig, changed: true };
        } catch (error2) {
          console.error("❌ Config fetch error:", error2);
          throw error2;
        }
      });
      const loadTenantConfig = (tenantHash) => __async(null, null, function* () {
        setLoading(true);
        setError(null);
        try {
          console.log(`🔍 Loading config for hash: ${tenantHash.slice(0, 8)}... via NEW hash + action system`);
          const result = yield fetchConfigWithCacheCheck(tenantHash, true);
          if (result.config) {
            setConfig(result.config);
            configMetadata.current.tenantHash = tenantHash;
            console.log("🎉 Config loaded successfully:", {
              chatTitle: result.config.chat_title,
              hash: tenantHash.slice(0, 8) + "...",
              apiType: "hash-action-NEW"
            });
          }
        } catch (error2) {
          console.error("❌ Failed to load config:", error2);
          setError(error2.message);
          console.log("🔧 Using fallback config");
          setConfig(getFallbackConfig(tenantHash));
        } finally {
          setLoading(false);
        }
      });
      const checkForConfigUpdates = () => __async(null, null, function* () {
        const tenantHash = configMetadata.current.tenantHash;
        if (!tenantHash) {
          console.warn("⚠️ No tenant hash available for update check");
          return;
        }
        try {
          const result = yield fetchConfigWithCacheCheck(tenantHash);
          if (result.changed && result.config) {
            setConfig(result.config);
            console.log("🎨 Config updated! New styling applied.");
            if (window.showConfigUpdateNotification) {
              window.showConfigUpdateNotification("Chat appearance updated");
            }
          }
        } catch (error2) {
          console.warn("⚠️ Config update check failed:", error2.message);
        }
      });
      const refreshConfig = () => __async(null, null, function* () {
        console.log("🔄 Manual config refresh requested");
        const tenantHash = getTenantHash();
        if (!tenantHash) {
          console.warn("🔄 Config refresh failed: No tenant hash available");
          return;
        }
        yield loadTenantConfig(tenantHash);
      });
      const getFallbackConfig = (tenantHash) => {
        console.log("🔧 Generating fallback config");
        return {
          tenant_hash: tenantHash,
          chat_title: "Chat",
          welcome_message: "Hello! How can I help you today?",
          branding: {
            primary_color: "#3b82f6",
            font_family: "Inter, sans-serif",
            chat_title: "Chat",
            border_radius: "12px"
          },
          features: {
            uploads: false,
            photo_uploads: false,
            callout: false
          },
          quick_help: {
            enabled: false
          },
          action_chips: {
            enabled: false
          },
          metadata: {
            source: "fallback",
            generated_at: Date.now(),
            apiType: "hash-action-NEW"
          }
        };
      };
      reactExports.useEffect(() => {
        const initializeConfig = () => __async(null, null, function* () {
          const tenantHash = getTenantHash();
          if (!tenantHash) {
            console.warn("🚀 Config initialization failed: No tenant hash available");
            return;
          }
          console.log("🚀 Initializing config for tenant:", tenantHash);
          yield loadTenantConfig(tenantHash);
        });
        initializeConfig();
        const interval = setInterval(() => {
          checkForConfigUpdates();
        }, 5 * 60 * 1e3);
        return () => clearInterval(interval);
      }, []);
      reactExports.useEffect(() => {
        const handleVisibilityChange = () => {
          if (!document.hidden && config) {
            setTimeout(checkForConfigUpdates, 1e3);
          }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
      }, [config]);
      const contextValue = {
        config,
        loading,
        error,
        refreshConfig,
        lastCheck: configMetadata.current.lastCheck,
        metadata: {
          etag: configMetadata.current.etag,
          tenantHash: configMetadata.current.tenantHash,
          lastModified: configMetadata.current.lastModified,
          apiType: "hash-action-NEW"
        },
        features: {
          uploads: ((_a = config == null ? void 0 : config.features) == null ? void 0 : _a.uploads) || false,
          photoUploads: ((_b = config == null ? void 0 : config.features) == null ? void 0 : _b.photo_uploads) || false
        }
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ConfigContext.Provider, { value: contextValue, children });
    };
    if (typeof window !== "undefined") {
      window.refreshPicassoConfig = () => {
        if (window.configProvider) {
          window.configProvider.refreshConfig();
        }
      };
      window.testHealthCheck = (tenantHash) => __async(null, null, function* () {
        if (!tenantHash) {
          console.error("🧪 testHealthCheck requires a tenantHash parameter. Usage: testHealthCheck('your_tenant_hash')");
          return null;
        }
        const hash = tenantHash;
        console.log("🧪 Testing NEW health check action...");
        try {
          const response = yield fetch(`https://chat.myrecruiter.ai/Master_Function?action=health_check&t=${hash}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json"
            },
            mode: "cors"
          });
          if (response.ok) {
            const data = yield response.json();
            console.log("✅ NEW Health Check Action:", data);
            return data;
          } else {
            console.error("❌ Health Check Failed:", response.status);
            return null;
          }
        } catch (error) {
          console.error("❌ Health Check Error:", error);
          return null;
        }
      });
      window.testConfigLoad = (tenantHash) => __async(null, null, function* () {
        if (!tenantHash) {
          console.error("🧪 testConfigLoad requires a tenantHash parameter. Usage: testConfigLoad('your_tenant_hash')");
          return null;
        }
        const hash = tenantHash;
        console.log("🧪 Testing NEW get_config action...");
        try {
          const response = yield fetch(`https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${hash}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json"
            },
            mode: "cors"
          });
          if (response.ok) {
            const config = yield response.json();
            console.log("✅ NEW Config Load Action:", {
              chatTitle: config.chat_title,
              hasBranding: !!config.branding,
              hasFeatures: !!config.features,
              tenantHash: config.tenant_hash
            });
            return config;
          } else {
            const errorText = yield response.text();
            console.error("❌ Config Load Failed:", response.status, errorText);
            return null;
          }
        } catch (error) {
          console.error("❌ Config Load Error:", error);
          return null;
        }
      });
      window.testChatAction = (tenantHash, userInput = "Hello") => __async(null, null, function* () {
        if (!tenantHash) {
          console.error("🧪 testChatAction requires a tenantHash parameter. Usage: testChatAction('your_tenant_hash', 'Hello')");
          return null;
        }
        const hash = tenantHash;
        console.log("🧪 Testing NEW chat action...");
        try {
          const response = yield fetch(`https://chat.myrecruiter.ai/Master_Function?action=chat&t=${hash}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            mode: "cors",
            body: JSON.stringify({
              tenant_hash: hash,
              user_input: userInput
            })
          });
          if (response.ok) {
            const data = yield response.json();
            console.log("✅ NEW Chat Action:", data);
            return data;
          } else {
            const errorText = yield response.text();
            console.error("❌ Chat Action Failed:", response.status, errorText);
            return null;
          }
        } catch (error) {
          console.error("❌ Chat Action Error:", error);
          return null;
        }
      });
      console.log(`
🛠️  PICASSO NEW PURE HASH + ACTION SYSTEM COMMANDS:
   testHealthCheck()             - Test action=health_check
   testConfigLoad()              - Test action=get_config  
   testChatAction()              - Test action=chat
   refreshPicassoConfig()        - Force refresh config
   
   NEW ENDPOINTS: /Master_Function?action=ACTION&t=HASH
   ✅ No parameters, no tenant IDs, no hardcoded customers
  `);
      console.log(`
🛠️  CONFIG API TEST COMMANDS:
   testConfigAPI("tenant_hash")    - Test config fetch
   testConfigAPI()                 - Test with current hash
  `);
    }
    const useConfig = () => {
      const ConfigContext2 = getConfigContext();
      return reactExports.useContext(ConfigContext2);
    };
    const ChatContext = reactExports.createContext();
    const getChatContext = () => ChatContext;
    const ChatProvider = ({ children }) => {
      const { config: tenantConfig } = useConfig();
      const [messages, setMessages] = reactExports.useState([]);
      const [isTyping, setIsTyping] = reactExports.useState(false);
      const [hasInitializedMessages, setHasInitializedMessages] = reactExports.useState(false);
      const generateWelcomeActions = reactExports.useCallback((config) => {
        if (!config) return [];
        const actionChipsConfig = config.action_chips || {};
        if (!actionChipsConfig.enabled || !actionChipsConfig.show_on_welcome) {
          return [];
        }
        const chips = actionChipsConfig.default_chips || [];
        const maxDisplay = actionChipsConfig.max_display || 3;
        return chips.slice(0, maxDisplay);
      }, []);
      reactExports.useEffect(() => {
        if (tenantConfig && !hasInitializedMessages) {
          console.log("🎬 Setting initial welcome message");
          const welcomeActions = generateWelcomeActions(tenantConfig);
          setMessages([{
            id: "welcome",
            role: "assistant",
            content: tenantConfig.welcome_message || "Hello! How can I help you today?",
            actions: welcomeActions
          }]);
          setHasInitializedMessages(true);
        }
      }, [tenantConfig, generateWelcomeActions, hasInitializedMessages]);
      const getTenantHash = () => {
        var _a, _b;
        const hash = (tenantConfig == null ? void 0 : tenantConfig.tenant_hash) || ((_a = tenantConfig == null ? void 0 : tenantConfig.metadata) == null ? void 0 : _a.tenantHash) || ((_b = window.PicassoConfig) == null ? void 0 : _b.tenant);
        if (!hash) {
          console.warn("Widget: No tenant hash available, operation failed");
          return null;
        }
        return hash;
      };
      const addMessage = reactExports.useCallback((message) => {
        const messageWithId = __spreadValues({
          id: message.id || `msg_${Date.now()}_${Math.random()}`,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }, message);
        setMessages((prev) => {
          if (message.replaceId) {
            return prev.map(
              (msg) => msg.id === message.replaceId ? messageWithId : msg
            );
          }
          return [...prev, messageWithId];
        });
        if (message.role === "user" && window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "PICASSO_EVENT",
            event: "MESSAGE_SENT",
            payload: {
              content: message.content,
              files: message.files || [],
              messageId: messageWithId.id
            }
          }, "*");
        }
        if (message.role === "user" && !message.skipBotResponse && !message.uploadState) {
          console.log("✅ Making chat request via actions API");
          setIsTyping(true);
          const makeAPICall = () => __async(null, null, function* () {
            try {
              const tenantHash = getTenantHash();
              if (!tenantHash) {
                console.error("Chat API call failed: No tenant hash available");
                setIsTyping(false);
                addMessage({
                  role: "assistant",
                  content: "Service temporarily unavailable. Please refresh the page."
                });
                return;
              }
              console.log("🚀 Making chat API call with hash:", tenantHash.slice(0, 8) + "...");
              const response = yield fetch("https://chat.myrecruiter.ai/Master_Function?action=chat&t=" + encodeURIComponent(tenantHash), {
                method: "POST",
                headers: {
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  tenant_hash: tenantHash,
                  // Include hash in body for redundancy
                  user_input: message.content,
                  session_id: `session_${Date.now()}`,
                  files: message.files || []
                })
              });
              console.log("📡 Chat response status:", response.status);
              if (!response.ok) {
                const errorText = yield response.text();
                console.error("❌ Chat API error:", errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              const rawText = yield response.text();
              console.log("📥 RAW CHAT RESPONSE:", rawText);
              let data;
              try {
                data = JSON.parse(rawText);
                console.log("📥 PARSED CHAT RESPONSE:", data);
              } catch (e) {
                console.error("❌ Failed to parse JSON:", e);
                throw new Error("Invalid JSON response from server");
              }
              let botContent = "I apologize, but I'm having trouble processing that request right now.";
              let botActions = [];
              try {
                if (data.content) {
                  botContent = data.content;
                  if (data.actions && Array.isArray(data.actions)) {
                    botActions = data.actions;
                  }
                } else if (data.messages && data.messages[0] && data.messages[0].content) {
                  const messageContent = JSON.parse(data.messages[0].content);
                  botContent = messageContent.message || messageContent.content || botContent;
                  if (messageContent.actions && Array.isArray(messageContent.actions)) {
                    botActions = messageContent.actions;
                  }
                } else if (data.body) {
                  const bodyData = JSON.parse(data.body);
                  botContent = bodyData.content || bodyData.message || botContent;
                  if (bodyData.actions && Array.isArray(bodyData.actions)) {
                    botActions = bodyData.actions;
                  }
                } else if (data.response) {
                  botContent = data.response;
                }
                if (data.fallback_message) {
                  botContent = data.fallback_message;
                }
                if (data.file_acknowledgment) {
                  botContent += "\n\n" + data.file_acknowledgment;
                }
              } catch (parseError) {
                console.error("❌ Error parsing response content:", parseError);
                if (typeof data === "string") {
                  botContent = data;
                }
              }
              setMessages((prev) => [...prev, {
                id: `bot_${Date.now()}_${Math.random()}`,
                role: "assistant",
                content: botContent,
                actions: botActions,
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                metadata: {
                  session_id: data.session_id,
                  api_version: data.api_version || "actions-complete"
                }
              }]);
              console.log("✅ Chat response processed successfully", {
                contentLength: botContent.length,
                actionsCount: botActions.length,
                sessionId: data.session_id
              });
            } catch (error) {
              console.error("❌ Chat API Error:", error);
              setMessages((prev) => [...prev, {
                id: `error_${Date.now()}_${Math.random()}`,
                role: "assistant",
                content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                metadata: {
                  error: error.message,
                  api_type: "actions-chat"
                }
              }]);
            } finally {
              setIsTyping(false);
            }
          });
          makeAPICall();
        }
      }, [tenantConfig]);
      const updateMessage = reactExports.useCallback((messageId, updates) => {
        setMessages(
          (prev) => prev.map(
            (msg) => msg.id === messageId ? __spreadValues(__spreadValues({}, msg), updates) : msg
          )
        );
      }, []);
      const clearMessages = reactExports.useCallback(() => {
        console.log("🗑️ Manually clearing messages");
        if (tenantConfig) {
          const welcomeActions = generateWelcomeActions(tenantConfig);
          setMessages([{
            id: "welcome",
            role: "assistant",
            content: tenantConfig.welcome_message || "Hello! How can I help you today?",
            actions: welcomeActions
          }]);
        } else {
          setMessages([{
            id: "welcome",
            role: "assistant",
            content: "Hello! How can I help you today?",
            actions: []
          }]);
        }
      }, [tenantConfig, generateWelcomeActions]);
      const value = {
        messages,
        isTyping,
        tenantConfig,
        addMessage,
        updateMessage,
        clearMessages,
        // Debug info
        _debug: {
          tenantHash: getTenantHash() || "none",
          apiType: "actions-only",
          configLoaded: !!tenantConfig,
          chatEndpoint: getTenantHash() ? `https://chat.myrecruiter.ai/Master_Function?action=chat&t=${getTenantHash()}` : "unavailable"
        }
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsx(ChatContext.Provider, { value, children });
    };
    if (typeof window !== "undefined") {
      window.testChatAPI = (message, tenantHash) => __async(null, null, function* () {
        if (!tenantHash) {
          console.error("🧪 testChatAPI requires a tenantHash parameter. Usage: testChatAPI('Hello', 'your_tenant_hash')");
          return null;
        }
        const hash = tenantHash;
        console.log("🧪 Testing chat API...");
        try {
          const response = yield fetch(`https://chat.myrecruiter.ai/Master_Function?action=chat&t=${hash}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              tenant_hash: hash,
              user_input: message || "Hello, this is a test message",
              session_id: `test_${Date.now()}`
            })
          });
          if (response.ok) {
            const data = yield response.json();
            console.log("✅ Chat API Test Response:", data);
            console.log("📝 Bot said:", data.content);
            if (data.actions && data.actions.length > 0) {
              console.log("🎯 Available actions:", data.actions.map((a) => a.label));
            }
            return data;
          } else {
            const errorText = yield response.text();
            console.error("❌ Chat API Test Failed:", response.status, errorText);
            return null;
          }
        } catch (error) {
          console.error("❌ Chat API Test Error:", error);
          return null;
        }
      });
      window.testVolunteer = () => window.testChatAPI("I want to volunteer");
      window.testDonate = () => window.testChatAPI("How can I donate?");
      window.testContact = () => window.testChatAPI("How do I contact you?");
      window.testServices = () => window.testChatAPI("What services do you offer?");
      console.log(`
🛠️  CHAT API TEST COMMANDS:
   testChatAPI("your message")     - Test any message
   testVolunteer()                 - Test volunteer response
   testDonate()                    - Test donation response  
   testContact()                   - Test contact response
   testServices()                  - Test services response
  `);
    }
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
    const toCamelCase = (string) => string.replace(
      /^([A-Z])|[\s-_]+(\w)/g,
      (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
    );
    const toPascalCase = (string) => {
      const camelCase = toCamelCase(string);
      return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
    };
    const mergeClasses = (...classes) => classes.filter((className, index, array) => {
      return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
    }).join(" ").trim();
    const hasA11yProp = (props) => {
      for (const prop in props) {
        if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
          return true;
        }
      }
    };
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    var defaultAttributes = {
      xmlns: "http://www.w3.org/2000/svg",
      width: 24,
      height: 24,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    };
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const Icon = reactExports.forwardRef(
      (_a, ref) => {
        var _b = _a, {
          color = "currentColor",
          size = 24,
          strokeWidth = 2,
          absoluteStrokeWidth,
          className = "",
          children,
          iconNode
        } = _b, rest = __objRest(_b, [
          "color",
          "size",
          "strokeWidth",
          "absoluteStrokeWidth",
          "className",
          "children",
          "iconNode"
        ]);
        return reactExports.createElement(
          "svg",
          __spreadValues(__spreadValues(__spreadProps(__spreadValues({
            ref
          }, defaultAttributes), {
            width: size,
            height: size,
            stroke: color,
            strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
            className: mergeClasses("lucide", className)
          }), !children && !hasA11yProp(rest) && { "aria-hidden": "true" }), rest),
          [
            ...iconNode.map(([tag2, attrs]) => reactExports.createElement(tag2, attrs)),
            ...Array.isArray(children) ? children : [children]
          ]
        );
      }
    );
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const createLucideIcon = (iconName, iconNode) => {
      const Component = reactExports.forwardRef(
        (_a, ref) => {
          var _b = _a, { className } = _b, props = __objRest(_b, ["className"]);
          return reactExports.createElement(Icon, __spreadValues({
            ref,
            iconNode,
            className: mergeClasses(
              `lucide-${toKebabCase(toPascalCase(iconName))}`,
              `lucide-${iconName}`,
              className
            )
          }, props));
        }
      );
      Component.displayName = toPascalCase(iconName);
      return Component;
    };
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$8 = [
      ["path", { d: "M5 12h14", key: "1ays0h" }],
      ["path", { d: "m12 5 7 7-7 7", key: "xquz4c" }]
    ];
    const ArrowRight = createLucideIcon("arrow-right", __iconNode$8);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$7 = [
      [
        "path",
        {
          d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z",
          key: "1tc9qg"
        }
      ],
      ["circle", { cx: "12", cy: "13", r: "3", key: "1vg3eu" }]
    ];
    const Camera = createLucideIcon("camera", __iconNode$7);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$6 = [
      ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", key: "1rqfz7" }],
      ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
      ["path", { d: "M9 15h6", key: "cctwl0" }],
      ["path", { d: "M12 18v-6", key: "17g6i2" }]
    ];
    const FilePlus = createLucideIcon("file-plus", __iconNode$6);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$5 = [
      ["rect", { width: "18", height: "18", x: "3", y: "3", rx: "2", ry: "2", key: "1m3agn" }],
      ["circle", { cx: "9", cy: "9", r: "2", key: "af1f0g" }],
      ["path", { d: "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", key: "1xmnt7" }]
    ];
    const Image$1 = createLucideIcon("image", __iconNode$5);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$4 = [
      ["path", { d: "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z", key: "p1xzt8" }],
      ["path", { d: "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1", key: "1cx29u" }]
    ];
    const MessagesSquare = createLucideIcon("messages-square", __iconNode$4);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$3 = [
      ["path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z", key: "131961" }],
      ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", key: "1vc78b" }],
      ["line", { x1: "12", x2: "12", y1: "19", y2: "22", key: "x3vr5v" }]
    ];
    const Mic = createLucideIcon("mic", __iconNode$3);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$2 = [
      ["path", { d: "M5 12h14", key: "1ays0h" }],
      ["path", { d: "M12 5v14", key: "s699le" }]
    ];
    const Plus = createLucideIcon("plus", __iconNode$2);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode$1 = [
      [
        "path",
        {
          d: "m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5",
          key: "ftymec"
        }
      ],
      ["rect", { x: "2", y: "6", width: "14", height: "12", rx: "2", key: "158x01" }]
    ];
    const Video = createLucideIcon("video", __iconNode$1);
    /**
     * @license lucide-react v0.511.0 - ISC
     *
     * This source code is licensed under the ISC license.
     * See the LICENSE file in the root directory of this source tree.
     */
    const __iconNode = [
      ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
      ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
    ];
    const X = createLucideIcon("x", __iconNode);
    const useChat = () => {
      const ChatContext2 = getChatContext();
      const context = reactExports.useContext(ChatContext2);
      if (!context) {
        throw new Error("useChat must be used within a ChatProvider");
      }
      return context;
    };
    function useCSSVariables(config) {
      reactExports.useEffect(() => {
        var _a;
        const root = document.documentElement;
        console.log("🔍 useCSSVariables called at:", (/* @__PURE__ */ new Date()).toISOString());
        console.log("🔍 useCSSVariables received config:", config);
        console.log("🔍 Config type:", typeof config);
        console.log("🔍 Config branding:", config == null ? void 0 : config.branding);
        console.log("🔍 Config keys:", config ? Object.keys(config) : "no config");
        if (!config) {
          console.log("⏳ Config not loaded yet, waiting...");
          return;
        }
        const branding = config.branding || {
          primary_color: "#3b82f6",
          background_color: "#ffffff",
          font_color: "#374151"
        };
        if (!config.branding) {
          console.warn("⚠️ No branding config found, using defaults");
        } else {
          console.log("✅ Found branding config:", config.branding);
        }
        console.log("🎨 Applying CSS variables for tenant:", config.tenant_hash || config.tenant_id);
        const features = config.features || {};
        const actionChipsConfig = features.action_chips || {};
        const actionChipsEnabled = typeof actionChipsConfig === "object" ? actionChipsConfig.enabled !== false : features.action_chips !== false;
        const quickHelpConfig = features.quick_help || {};
        const quickHelpEnabled = typeof quickHelpConfig === "object" ? quickHelpConfig.enabled !== false : features.quick_help !== false;
        const calloutConfig = features.callout || {};
        const calloutEnabled = typeof calloutConfig === "object" ? calloutConfig.enabled !== false : features.callout !== false;
        const cssVariables = {
          /* === BASE COLOR SYSTEM === */
          "--primary-color": branding.primary_color || "#3b82f6",
          "--primary-light": branding.primary_light || lightenColor(branding.primary_color || "#3b82f6", 15),
          "--primary-dark": branding.primary_dark || darkenColor(branding.primary_color || "#3b82f6", 15),
          "--secondary-color": branding.secondary_color || "#6b7280",
          "--font-color": branding.font_color || "#374151",
          "--background-color": branding.background_color || "#ffffff",
          "--border-color": branding.border_color || "rgba(59, 130, 246, 0.1)",
          "--success-color": branding.success_color || "#10b981",
          "--warning-color": branding.warning_color || "#f59e0b",
          "--error-color": branding.error_color || "#ef4444",
          "--info-color": branding.info_color || "#3b82f6",
          /* === CHAT BUBBLE COLORS === */
          "--user-bubble-color": branding.user_bubble_color || branding.primary_color || "#3b82f6",
          "--user-bubble-text-color": branding.user_bubble_text_color || determineContrastColor(branding.user_bubble_color || branding.primary_color || "#3b82f6"),
          "--bot-bubble-color": branding.bot_bubble_color || "#f8fafc",
          "--bot-bubble-text-color": branding.bot_bubble_text_color || branding.font_color || "#374151",
          "--bot-bubble-border": branding.bot_bubble_border || branding.border_color || "rgba(59, 130, 246, 0.1)",
          /* === INTERFACE COLORS === */
          "--header-background-color": branding.header_background_color || branding.primary_color || "#3b82f6",
          "--header-text-color": branding.header_text_color || determineHeaderTextColor(branding),
          "--widget-icon-color": branding.widget_icon_color || "#ffffff",
          "--widget-background-color": branding.widget_background_color || branding.primary_color || "#3b82f6",
          "--link-color": branding.link_color || branding.primary_color || "#3b82f6",
          "--link-hover-color": branding.link_hover_color || darkenColor(branding.link_color || branding.primary_color || "#3b82f6", 10),
          /* === INPUT SYSTEM === */
          "--input-background-color": branding.input_background_color || branding.background_color || "#ffffff",
          "--input-border-color": branding.input_border_color || branding.border_color || "rgba(59, 130, 246, 0.1)",
          "--input-text-color": branding.input_text_color || branding.font_color || "#374151",
          "--input-placeholder-color": branding.input_placeholder_color || "#6b7280",
          "--input-focus-color": branding.input_focus_color || branding.primary_color || "#3b82f6",
          "--input-focus-border-color": branding.input_focus_border_color || branding.primary_color || "#3b82f6",
          "--input-font-size": ensurePixelUnit(branding.input_font_size || "14px"),
          "--input-padding": branding.input_padding || "12px 16px",
          "--input-border-radius": ensurePixelUnit(branding.input_border_radius || branding.border_radius || "12px"),
          "--input-border-width": ensurePixelUnit(branding.input_border_width || "1px"),
          "--input-min-height": ensurePixelUnit(branding.input_min_height || "44px"),
          "--input-max-height": ensurePixelUnit(branding.input_max_height || "120px"),
          /* === TYPOGRAPHY === */
          "--font-family": branding.font_family || "system-ui, -apple-system, sans-serif",
          "--font-size-base": ensurePixelUnit(branding.font_size || "14px"),
          "--font-size-heading": ensurePixelUnit(branding.font_size_heading || "16px"),
          "--font-size-small": ensurePixelUnit(branding.font_size_small || "12px"),
          "--font-size-large": ensurePixelUnit(branding.font_size_large || "18px"),
          "--font-weight-normal": branding.font_weight_normal || branding.font_weight || "400",
          "--font-weight-medium": branding.font_weight_medium || "500",
          "--font-weight-semibold": branding.font_weight_semibold || "600",
          "--font-weight-bold": branding.font_weight_bold || "700",
          "--font-weight-heading": branding.font_weight_heading || "600",
          "--line-height-base": branding.line_height || "1.5",
          "--line-height-heading": branding.line_height_heading || "1.2",
          /* === LAYOUT & SPACING === */
          "--border-radius": ensurePixelUnit(branding.border_radius || "12px"),
          "--border-radius-small": ensurePixelUnit(branding.border_radius_small || calculateSmallRadius(branding.border_radius)),
          "--border-radius-large": ensurePixelUnit(branding.border_radius_large || calculateLargeRadius(branding.border_radius)),
          "--border-width": ensurePixelUnit(branding.border_width || "1px"),
          "--border-width-thick": ensurePixelUnit(branding.border_width_thick || "2px"),
          /* === SPACING SYSTEM === */
          "--message-spacing": branding.message_spacing || "20px",
          "--bubble-padding": branding.bubble_padding || "12px 16px",
          "--container-padding": branding.container_padding || "16px",
          "--action-chip-margin": branding.action_chip_margin || "16px",
          "--action-chip-gap": branding.action_chip_gap || "8px",
          "--action-chip-container-padding": branding.action_chip_container_padding || "4px 0",
          /* === CHAT WIDGET DIMENSIONS === */
          "--chat-width": ensurePixelUnit(branding.chat_width || "360px"),
          "--chat-height": ensurePixelUnit(branding.chat_height || "640px"),
          "--chat-max-height": branding.chat_max_height || "80vh",
          "--chat-width-large": ensurePixelUnit(branding.chat_width_large || "400px"),
          "--chat-height-large": ensurePixelUnit(branding.chat_height_large || "700px"),
          "--chat-width-mobile": branding.chat_width_mobile || "calc(100vw - 24px)",
          "--chat-height-mobile": branding.chat_height_mobile || "calc(100vh - 160px)",
          "--chat-width-tablet": branding.chat_width_tablet || "calc(100vw - 32px)",
          "--chat-height-tablet": branding.chat_height_tablet || "calc(100vh - 140px)",
          /* === WIDGET POSITIONING === */
          "--widget-bottom": calculateWidgetPosition(branding.chat_position, "bottom"),
          "--widget-right": calculateWidgetPosition(branding.chat_position, "right"),
          "--widget-top": calculateWidgetPosition(branding.chat_position, "top"),
          "--widget-left": calculateWidgetPosition(branding.chat_position, "left"),
          "--widget-z-index": branding.widget_z_index || "1000",
          "--chat-transform-origin": calculateTransformOrigin(branding.chat_position),
          /* === AVATAR SYSTEM === */
          "--avatar-url": generateAvatarUrl(config),
          "--avatar-border-radius": determineAvatarBorderRadius(branding.avatar_shape),
          "--avatar-display": branding.avatar_shape === "hidden" ? "none" : "block",
          "--avatar-border": branding.avatar_border || "2px solid rgba(59, 130, 246, 0.15)",
          "--avatar-shadow": branding.avatar_shadow || "0 2px 8px rgba(59, 130, 246, 0.1), 0 1px 3px rgba(0, 0, 0, 0.05)",
          /* === MESSAGE HEADER STYLING === */
          "--message-avatar-size": branding.message_avatar_size || "24px",
          "--message-sender-font-size": branding.message_sender_font_size || "13px",
          "--message-sender-font-weight": branding.message_sender_font_weight || "600",
          "--message-sender-color": branding.message_sender_color || branding.font_color || "#374151",
          /* === LOGO/AVATAR BACKGROUND COLORS === */
          "--logo-background-color": branding.logo_background_color || branding.avatar_background_color || "transparent",
          "--avatar-background-color": branding.avatar_background_color || branding.logo_background_color || "transparent",
          "--chat-header-logo-bg": branding.logo_background_color || branding.avatar_background_color || "transparent",
          "--bot-avatar-bg": branding.avatar_background_color || branding.logo_background_color || "transparent",
          /* === ACTION CHIP SYSTEM === */
          "--action-chip-bg": branding.action_chip_bg || "rgba(59, 130, 246, 0.08)",
          "--action-chip-border": branding.action_chip_border || "2px solid rgba(59, 130, 246, 0.2)",
          "--action-chip-color": branding.action_chip_color || branding.primary_color || "#3b82f6",
          "--action-chip-hover-bg": branding.action_chip_hover_bg || branding.primary_color || "#3b82f6",
          "--action-chip-hover-color": branding.action_chip_hover_color || "#ffffff",
          "--action-chip-hover-border": branding.action_chip_hover_border || branding.primary_color || "#3b82f6",
          "--action-chip-disabled-bg": branding.action_chip_disabled_bg || "#f9fafb",
          "--action-chip-disabled-color": branding.action_chip_disabled_color || "#9ca3af",
          "--action-chip-disabled-border": branding.action_chip_disabled_border || "#e5e7eb",
          "--action-chip-padding": branding.action_chip_padding || "12px 16px",
          "--action-chip-radius": ensurePixelUnit(branding.action_chip_radius || "8px"),
          "--action-chip-font-size": ensurePixelUnit(branding.action_chip_font_size || "13px"),
          "--action-chip-font-weight": branding.action_chip_font_weight || "500",
          "--action-chip-shadow": branding.action_chip_shadow || "0 1px 3px rgba(0, 0, 0, 0.1)",
          "--action-chip-hover-shadow": generateActionChipShadow(branding.primary_color),
          /* === CALLOUT SYSTEM === */
          "--callout-background": branding.callout_background || branding.background_color || "#ffffff",
          "--callout-border-color": branding.callout_border_color || branding.border_color || "rgba(59, 130, 246, 0.1)",
          "--callout-border-width": branding.callout_border_width || "1px",
          "--callout-border-radius": ensurePixelUnit(branding.callout_border_radius || branding.border_radius || "12px"),
          "--callout-padding": branding.callout_padding || "14px 18px",
          "--callout-min-width": ensurePixelUnit(branding.callout_min_width || "160px"),
          "--callout-max-width": ensurePixelUnit(branding.callout_max_width || "320px"),
          "--callout-font-size": ensurePixelUnit(branding.callout_font_size || "14px"),
          "--callout-text-color": branding.callout_text_color || branding.font_color || "#374151",
          "--callout-main-weight": branding.callout_main_weight || "600",
          "--callout-main-size": ensurePixelUnit(branding.callout_main_size || "14px"),
          "--callout-main-color": branding.callout_main_color || branding.font_color || "#374151",
          "--callout-subtitle-size": ensurePixelUnit(branding.callout_subtitle_size || "12px"),
          "--callout-subtitle-weight": branding.callout_subtitle_weight || "400",
          "--callout-subtitle-color": branding.callout_subtitle_color || branding.secondary_color || "#6b7280",
          "--callout-close-bg": branding.callout_close_bg || "rgba(0, 0, 0, 0.05)",
          "--callout-close-color": branding.callout_close_color || branding.secondary_color || "#6b7280",
          "--callout-close-radius": ensurePixelUnit(branding.callout_close_radius || "50%"),
          "--callout-close-hover-bg": branding.callout_close_hover_bg || branding.border_color || "rgba(59, 130, 246, 0.1)",
          "--callout-close-hover-color": branding.callout_close_hover_color || branding.font_color || "#374151",
          "--callout-animation-duration": branding.callout_animation_duration || "0.35s",
          /* === ENHANCED SHADOW SYSTEM === */
          "--bubble-shadow": branding.bubble_shadow || "0 1px 3px rgba(0, 0, 0, 0.1)",
          "--bubble-shadow-hover": branding.bubble_shadow_hover || "0 2px 8px rgba(0, 0, 0, 0.15)",
          "--primary-shadow": branding.primary_shadow || generatePrimaryShadow(branding.primary_color),
          "--primary-shadow-light": branding.primary_shadow_light || generatePrimaryShadowLight(branding.primary_color),
          "--primary-shadow-hover": branding.primary_shadow_hover || generatePrimaryShadowHover(branding.primary_color),
          "--container-shadow": branding.container_shadow || "0 10px 25px rgba(0, 0, 0, 0.1)",
          "--header-shadow": branding.header_shadow || generatePrimaryShadowLight(branding.primary_color),
          "--input-shadow": branding.input_shadow || generateInputShadow(branding.primary_color),
          "--input-focus-shadow": branding.input_focus_shadow || generateInputFocusShadow(branding.primary_color),
          "--send-button-shadow": branding.send_button_shadow || generatePrimaryShadow(branding.primary_color),
          "--shadow-light": branding.shadow_light || "0 1px 3px rgba(0, 0, 0, 0.08)",
          "--shadow-medium": branding.shadow_medium || "0 4px 12px rgba(0, 0, 0, 0.1)",
          "--shadow-heavy": branding.shadow_heavy || "0 20px 25px rgba(0, 0, 0, 0.1)",
          /* === GRADIENTS === */
          "--user-bubble-gradient": generateUserBubbleGradient(branding.user_bubble_color || branding.primary_color),
          "--header-gradient": generateHeaderGradient(branding.header_background_color || branding.primary_color),
          "--primary-gradient": generatePrimaryGradient(branding.primary_color),
          "--widget-gradient": generateWidgetGradient(branding.widget_background_color || branding.primary_color),
          /* === CLOSE BUTTON COLORS === */
          "--close-button-hover-bg": generateCloseButtonHoverBg(branding),
          "--close-button-hover-color": generateCloseButtonHoverColor(branding),
          "--title-text-shadow": branding.enable_white_title ? "0 1px 3px rgba(0, 0, 0, 0.3)" : "none",
          /* === COMPUTED COLORS === */
          "--button-hover-color": darkenColor(branding.primary_color || "#3b82f6", 10),
          "--primary-light-computed": lightenColor(branding.primary_color || "#3b82f6", 90),
          /* === ANIMATION & TRANSITIONS === */
          "--transition-fast": branding.transition_fast || "0.15s ease",
          "--transition-normal": branding.transition_normal || "0.2s ease",
          "--transition-slow": branding.transition_slow || "0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          "--typing-animation-duration": features.streaming ? "0.8s" : "1.4s",
          /* === FEATURE-BASED STYLING === */
          "--upload-button-display": features.uploads || features.photo_uploads ? "flex" : "none",
          "--photo-upload-display": features.photo_uploads !== false ? "flex" : "none",
          "--photo-button-display": features.photo_uploads !== false ? "flex" : "none",
          "--voice-display": features.voice_input ? "flex" : "none",
          "--voice-button-display": features.voice_input ? "flex" : "none",
          "--action-chips-display": actionChipsEnabled ? "flex" : "none",
          "--action-chips-short-text-threshold": branding.action_chips_short_text_threshold || "16",
          "--callout-display": calloutEnabled ? "block" : "none",
          "--callout-enabled": calloutEnabled ? "1" : "0",
          "--notification-display": "flex",
          /* === QUICK HELP STYLING === */
          "--quick-help-bg": branding.quick_help_bg || "#fafbfc",
          "--quick-help-border": branding.quick_help_border || "#f0f0f0",
          "--quick-help-shadow": branding.quick_help_shadow || "0 -4px 20px rgba(0, 0, 0, 0.1)",
          "--quick-help-overlay-bg": branding.quick_help_overlay_bg || "#ffffff",
          "--quick-help-overlay-border": branding.quick_help_overlay_border || "#e5e7eb",
          "--quick-help-overlay-shadow": branding.quick_help_overlay_shadow || "0 -4px 12px rgba(0, 0, 0, 0.1)",
          "--quick-help-button-shadow": branding.quick_help_button_shadow || "0 2px 4px rgba(0, 0, 0, 0.08)",
          "--quick-help-animation-duration": branding.quick_help_animation_duration || "0.375s",
          "--quick-help-slide-distance": branding.quick_help_slide_distance || "20px",
          /* === CALLOUT STYLING === */
          "--callout-shadow": branding.callout_shadow || "0 8px 24px rgba(0, 0, 0, 0.15)",
          "--callout-hover-shadow": branding.callout_hover_shadow || "0 12px 32px rgba(0, 0, 0, 0.2)",
          "--callout-animation-duration": branding.callout_animation_duration || "0.3s",
          "--notification-animation-duration": branding.notification_animation_duration || "2s",
          /* === FOCUS STATES === */
          "--focus-ring": generateFocusRing(branding.input_focus_color || branding.primary_color),
          "--input-focus-ring-color": generateInputFocusRing(branding.input_focus_color || branding.primary_color),
          "--input-divider-color": branding.input_divider_color || "transparent",
          "--input-divider-focus-color": generateInputDividerFocusColor(branding.primary_color),
          /* === RESPONSIVE BREAKPOINTS === */
          "--mobile-breakpoint": branding.mobile_breakpoint || "480px",
          "--tablet-breakpoint": branding.tablet_breakpoint || "768px",
          "--desktop-breakpoint": branding.desktop_breakpoint || "1024px",
          /* === UPLOAD STATES === */
          "--upload-success-border": branding.upload_success_border || "#10b981",
          "--upload-success-bg": branding.upload_success_bg || "rgba(16, 185, 129, 0.1)",
          "--upload-error-border": branding.upload_error_border || "#ef4444",
          "--upload-error-bg": branding.upload_error_bg || "rgba(239, 68, 68, 0.1)",
          "--upload-warning-border": branding.upload_warning_border || "#f59e0b",
          "--upload-warning-bg": branding.upload_warning_bg || "rgba(245, 158, 11, 0.1)"
        };
        const isInIframe = document.body.getAttribute("data-iframe") === "true";
        if (isInIframe) {
          console.log("🖼️ Iframe context detected - applying iframe-specific variables");
          cssVariables["--chat-width"] = "100%";
          cssVariables["--chat-height"] = "100%";
          cssVariables["--chat-max-height"] = "100%";
          cssVariables["--chat-width-large"] = "100%";
          cssVariables["--chat-height-large"] = "100%";
          cssVariables["--chat-width-mobile"] = "100%";
          cssVariables["--chat-height-mobile"] = "100%";
          cssVariables["--chat-width-tablet"] = "100%";
          cssVariables["--chat-height-tablet"] = "100%";
          cssVariables["--widget-bottom"] = "auto";
          cssVariables["--widget-right"] = "auto";
          cssVariables["--widget-top"] = "auto";
          cssVariables["--widget-left"] = "auto";
          cssVariables["--chat-container-position"] = "static";
          cssVariables["--chat-container-width"] = "100%";
          cssVariables["--chat-container-height"] = "100%";
          cssVariables["--chat-container-max-height"] = "100%";
          cssVariables["--chat-container-margin"] = "0";
          cssVariables["--chat-container-border-radius"] = "0";
          console.log("✅ Iframe-specific CSS variables applied");
        }
        const appliedVariables = [];
        const failedVariables = [];
        Object.entries(cssVariables).forEach(([property, value]) => {
          if (value && typeof value === "string" && value !== "undefined" && value !== "null") {
            try {
              root.style.setProperty(property, value);
              appliedVariables.push(property);
            } catch (error) {
              console.warn(`⚠️ Failed to set ${property}:`, error);
              failedVariables.push({ property, value, error: error.message });
            }
          }
        });
        applyEnhancedFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled);
        applyChatPositioning(branding.chat_position, root);
        applyComputedStyles(cssVariables, root);
        console.log(`🎨 Applied ${appliedVariables.length} CSS variables for tenant: ${config.tenant_hash || config.tenant_id}`);
        if (failedVariables.length > 0) {
          console.warn(`⚠️ ${failedVariables.length} variables failed:`, failedVariables);
        }
        window.currentPicassoConfig = config;
        window.appliedCSSVariables = cssVariables;
        window.picassoDebug = {
          config,
          appliedVariables: cssVariables,
          tenant_hash: config == null ? void 0 : config.tenant_hash,
          enhancementsApplied: true,
          configSource: (_a = config.metadata) == null ? void 0 : _a.source
        };
        return () => {
          console.log("🧹 Cleaning up CSS variables...");
          appliedVariables.forEach((property) => {
            root.style.removeProperty(property);
          });
        };
      }, [config]);
    }
    function calculateWidgetPosition(chatPosition, dimension) {
      const position = (chatPosition || "Bottom Right").toLowerCase();
      const positions = {
        "bottom right": { bottom: "24px", right: "24px", top: "auto", left: "auto" },
        "bottom left": { bottom: "24px", left: "24px", top: "auto", right: "auto" },
        "top right": { top: "24px", right: "24px", bottom: "auto", left: "auto" },
        "top left": { top: "24px", left: "24px", bottom: "auto", right: "auto" }
      };
      const pos = positions[position] || positions["bottom right"];
      return pos[dimension] || "auto";
    }
    function calculateTransformOrigin(chatPosition) {
      const position = (chatPosition || "Bottom Right").toLowerCase();
      const transformOrigins = {
        "bottom-right": "bottom right",
        "bottom-left": "bottom left",
        "top-right": "top right",
        "top-left": "top left"
      };
      return transformOrigins[position.replace(" ", "-")] || "bottom right";
    }
    function generateAvatarUrl(config) {
      var _a, _b, _c2;
      const { tenant_hash, branding, _cloudfront } = config || {};
      console.log("🖼️ Generating avatar URL for tenant hash:", tenant_hash || "no-hash");
      const avatarSources = [
        // Direct URLs from config (highest priority)
        branding == null ? void 0 : branding.avatar_url,
        branding == null ? void 0 : branding.logo_url,
        branding == null ? void 0 : branding.bot_avatar_url,
        branding == null ? void 0 : branding.icon,
        (_a = branding == null ? void 0 : branding.custom_icons) == null ? void 0 : _a.bot_avatar,
        // CloudFront generated URLs
        (_b = _cloudfront == null ? void 0 : _cloudfront.urls) == null ? void 0 : _b.avatar,
        (_c2 = _cloudfront == null ? void 0 : _cloudfront.urls) == null ? void 0 : _c2.logo,
        // Hash-based generic paths (tenant agnostic)
        tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.png` : null,
        tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.png` : null,
        tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.svg` : null,
        tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.svg` : null,
        // Generic fallbacks
        "https://chat.myrecruiter.ai/collateral/default-avatar.png"
      ];
      const finalUrl = avatarSources.find((url) => url && url.trim() && url !== "undefined") || "https://chat.myrecruiter.ai/collateral/default-avatar.png";
      console.log("✅ Selected avatar URL:", finalUrl);
      return `url(${finalUrl})`;
    }
    function determineAvatarBorderRadius(avatarShape) {
      const shape = (avatarShape || "circle").toLowerCase();
      const shapeStyles = {
        "circle": "50%",
        "rounded": "8px",
        "square": "0px",
        "hidden": "50%"
      };
      return shapeStyles[shape] || "50%";
    }
    function generateUserBubbleGradient(color) {
      if (!color) return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
      const darkened = darkenColor(color, 10);
      return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
    }
    function generateHeaderGradient(color) {
      if (!color) return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
      const darkened = darkenColor(color, 8);
      return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
    }
    function generatePrimaryGradient(color) {
      if (!color) return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
      const darkened = darkenColor(color, 12);
      return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
    }
    function generateWidgetGradient(color) {
      if (!color) return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
      const darkened = darkenColor(color, 6);
      return `linear-gradient(135deg, ${color} 0%, ${darkened} 100%)`;
    }
    function generateActionChipShadow(primaryColor) {
      const rgb = hexToRgb(primaryColor || "#3b82f6");
      if (!rgb) return "0 4px 12px rgba(59, 130, 246, 0.25), 0 1px 3px rgba(59, 130, 246, 0.1)";
      return `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25), 0 1px 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
    function generatePrimaryShadow(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 4px 12px rgba(59, 130, 246, 0.25)";
      return `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
    }
    function generatePrimaryShadowLight(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 2px 8px rgba(59, 130, 246, 0.15)";
      return `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
    }
    function generatePrimaryShadowHover(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 6px 16px rgba(59, 130, 246, 0.3)";
      return `0 6px 16px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
    }
    function generateInputShadow(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 2px 8px rgba(59, 130, 246, 0.08)";
      return `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
    }
    function generateInputFocusShadow(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 0 0 3px rgba(59, 130, 246, 0.1), 0 4px 12px rgba(59, 130, 246, 0.15)";
      return `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1), 0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
    }
    function generateCloseButtonHoverBg(branding) {
      const headerBg = branding.header_background_color || branding.title_bar_color || "#3b82f6";
      return isLightColor(headerBg) ? "rgba(0, 0, 0, 0.1)" : "rgba(255, 255, 255, 0.25)";
    }
    function generateCloseButtonHoverColor(branding) {
      const headerBg = branding.header_background_color || branding.title_bar_color || "#3b82f6";
      return isLightColor(headerBg) ? "#374151" : "#ffffff";
    }
    function determineHeaderTextColor(branding) {
      if (branding.header_text_color) {
        return branding.header_text_color;
      }
      if (branding.chat_title_color) {
        return branding.chat_title_color;
      }
      if (branding.title_color) {
        return branding.title_color;
      }
      const headerBg = branding.header_background_color || branding.title_bar_color || "#3b82f6";
      const forceWhite = branding.enable_white_title || branding.white_title;
      if (forceWhite) {
        return "#ffffff";
      }
      return isLightColor(headerBg) ? "#1f2937" : "#ffffff";
    }
    function determineContrastColor(backgroundColor) {
      return isLightColor(backgroundColor) ? "#1f2937" : "#ffffff";
    }
    function generateFocusRing(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "0 0 0 3px rgba(59, 130, 246, 0.2)";
      return `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
    }
    function generateInputFocusRing(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "rgba(59, 130, 246, 0.1)";
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
    function generateInputDividerFocusColor(color) {
      const rgb = hexToRgb(color || "#3b82f6");
      if (!rgb) return "rgba(59, 130, 246, 0.1)";
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
    function applyEnhancedFeatureStyles(features, root, config, quickHelpEnabled, actionChipsEnabled, calloutEnabled) {
      console.log("🎛️ Applying enhanced feature styles");
      const featureClasses = [];
      if (!features.uploads) featureClasses.push("feature-uploads-disabled");
      if (!features.voice_input) featureClasses.push("feature-voice-disabled");
      if (!quickHelpEnabled) featureClasses.push("feature-quick-help-disabled");
      if (!actionChipsEnabled) featureClasses.push("feature-action-chips-disabled");
      if (!calloutEnabled) featureClasses.push("feature-callout-disabled");
      document.body.classList.remove(
        "feature-uploads-disabled",
        "feature-voice-disabled",
        "feature-quick-help-disabled",
        "feature-action-chips-disabled",
        "feature-callout-disabled"
      );
      if (featureClasses.length > 0) {
        document.body.classList.add(...featureClasses);
      }
      console.log("✅ Enhanced feature styles applied:", {
        quickHelpEnabled,
        actionChipsEnabled,
        calloutEnabled,
        appliedClasses: featureClasses
      });
    }
    function applyChatPositioning(chatPosition, root) {
      const position = (chatPosition || "Bottom Right").toLowerCase();
      const positionClass = position.replace(" ", "-");
      root.style.setProperty("--chat-position-class", positionClass);
      const transformOrigins = {
        "bottom-right": "bottom right",
        "bottom-left": "bottom left",
        "top-right": "top right",
        "top-left": "top left"
      };
      root.style.setProperty("--chat-transform-origin", transformOrigins[positionClass] || "bottom right");
      console.log(`✅ Chat position: ${position}`);
    }
    function applyComputedStyles(variables, root) {
      console.log("🧮 Computing advanced styles...");
      const primaryColor = variables["--primary-color"];
      if (primaryColor && primaryColor.startsWith("#")) {
        try {
          const rgb = hexToRgb(primaryColor);
          if (rgb) {
            root.style.setProperty("--primary-shadow-computed", `0 4px 12px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`);
            root.style.setProperty("--primary-shadow-hover-computed", `0 8px 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`);
            root.style.setProperty("--primary-shadow-light-computed", `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
          }
        } catch (e) {
          console.warn("Shadow computation failed:", e);
        }
      }
      const focusColor = variables["--input-focus-color"];
      if (focusColor) {
        const rgb = hexToRgb(focusColor);
        if (rgb) {
          root.style.setProperty("--focus-ring-computed", `0 0 0 3px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
        }
      }
      console.log("✅ Advanced styles computed");
    }
    function isLightColor(color) {
      if (!color || typeof color !== "string") return true;
      const hex = color.replace("#", "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const brightness = (r * 299 + g * 587 + b * 114) / 1e3;
      return brightness > 128;
    }
    function hexToRgb(hex) {
      if (!hex || typeof hex !== "string") return null;
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    }
    function darkenColor(color, percent) {
      if (!color || !color.startsWith("#")) return color;
      try {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 255) - amt);
        const B = Math.max(0, (num & 255) - amt);
        return "#" + (16777216 + R * 65536 + G * 256 + B).toString(16).slice(1);
      } catch (e) {
        console.warn("Color darkening failed:", e);
        return color;
      }
    }
    function lightenColor(color, percent) {
      if (!color || !color.startsWith("#")) return color;
      try {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 255) + amt);
        const B = Math.min(255, (num & 255) + amt);
        return "#" + (16777216 + R * 65536 + G * 256 + B).toString(16).slice(1);
      } catch (e) {
        console.warn("Color lightening failed:", e);
        return color;
      }
    }
    function calculateSmallRadius(mainRadius) {
      if (!mainRadius) return "8px";
      const numValue = parseInt(mainRadius, 10);
      return isNaN(numValue) ? "8px" : `${Math.round(numValue * 0.5)}px`;
    }
    function calculateLargeRadius(mainRadius) {
      if (!mainRadius) return "16px";
      const numValue = parseInt(mainRadius, 10);
      return isNaN(numValue) ? "16px" : `${Math.round(numValue * 1.5)}px`;
    }
    function ensurePixelUnit(value) {
      if (!value) return value;
      if (typeof value === "number") return `${value}px`;
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : `${parsed}px`;
    }
    function CSSVariablesProvider({ children }) {
      const { config } = useConfig();
      useCSSVariables(config);
      reactExports.useEffect(() => {
        var _a;
        window.configProvider = { config };
        window.currentTenantConfig = config;
        window.picassoDebug = {
          config,
          appliedVariables: window.appliedCSSVariables,
          tenant_hash: config == null ? void 0 : config.tenant_hash,
          enhancementsApplied: true,
          configSource: ((_a = config == null ? void 0 : config.metadata) == null ? void 0 : _a.source) || "unknown"
        };
        console.log("🎨 CSS variables provider ready");
      }, [config]);
      return children;
    }
    if (typeof window !== "undefined") {
      window.testCSS = (property, value) => {
        console.log(`🧪 Testing CSS update: ${property} = ${value}`);
        document.documentElement.style.setProperty(property, value);
      };
      window.debugLogoBackground = () => {
        var _a, _b;
        const config = window.currentTenantConfig;
        const root = document.documentElement;
        console.log("🔍 Logo Background Debug:", {
          configLogoBackground: (_a = config == null ? void 0 : config.branding) == null ? void 0 : _a.logo_background_color,
          configAvatarBackground: (_b = config == null ? void 0 : config.branding) == null ? void 0 : _b.avatar_background_color,
          cssLogoBackground: root.style.getPropertyValue("--logo-background-color"),
          cssAvatarBackground: root.style.getPropertyValue("--avatar-background-color"),
          cssChatHeaderLogoBg: root.style.getPropertyValue("--chat-header-logo-bg"),
          cssBotAvatarBg: root.style.getPropertyValue("--bot-avatar-bg")
        });
        const logoElement = document.querySelector(".chat-header-logo");
        if (logoElement) {
          const computedStyle = window.getComputedStyle(logoElement);
          console.log("🎨 Logo Element Computed Styles:", {
            backgroundColor: computedStyle.backgroundColor,
            backgroundImage: computedStyle.backgroundImage,
            backgroundSize: computedStyle.backgroundSize,
            backgroundPosition: computedStyle.backgroundPosition
          });
        } else {
          console.log("❌ Logo element not found (.chat-header-logo)");
        }
      };
      window.testQuickHelpToggle = () => {
        const currentDisplay = document.documentElement.style.getPropertyValue("--quick-help-container-display");
        const newDisplay = currentDisplay === "none" ? "block" : "none";
        document.documentElement.style.setProperty("--quick-help-container-display", newDisplay);
        console.log(`🧪 Quick Help toggled: ${newDisplay}`);
      };
      window.testActionChipsToggle = () => {
        const currentDisplay = document.documentElement.style.getPropertyValue("--action-chips-display");
        const newDisplay = currentDisplay === "none" ? "flex" : "none";
        document.documentElement.style.setProperty("--action-chips-display", newDisplay);
        console.log(`🧪 Action Chips toggled: ${newDisplay}`);
      };
      window.testAvatarUrl = (url) => __async(null, null, function* () {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            console.log("✅ Avatar URL works:", url);
            resolve(true);
          };
          img.onerror = () => {
            console.log("❌ Avatar URL failed:", url);
            resolve(false);
          };
          img.src = url;
        });
      });
      window.debugAvatar = (config) => __async(null, null, function* () {
        console.log("🔍 Avatar Debug - Multi-Tenant System:");
        const currentConfig = config || window.currentTenantConfig;
        if (!currentConfig) {
          console.log("❌ No config available for avatar testing");
          return;
        }
        const { tenant_hash, branding } = currentConfig;
        const candidateUrls = [
          branding == null ? void 0 : branding.avatar_url,
          branding == null ? void 0 : branding.logo_url,
          tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.png` : null,
          tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/logo.png` : null,
          tenant_hash ? `https://chat.myrecruiter.ai/tenants/hash-${tenant_hash}/avatar.svg` : null,
          "https://chat.myrecruiter.ai/collateral/default-avatar.png"
        ].filter((url) => url && url.trim());
        console.log("🧪 Testing avatar URLs for hash:", tenant_hash);
        for (const url of candidateUrls) {
          const works = yield window.testAvatarUrl(url);
          if (works) {
            console.log("🎯 First working URL found:", url);
            document.documentElement.style.setProperty("--avatar-url", `url(${url})`);
            return `url(${url})`;
          }
        }
        console.log("⚠️ No working avatar URLs found, using default");
        document.documentElement.style.setProperty("--avatar-url", "url(https://chat.myrecruiter.ai/collateral/default-avatar.png)");
        return "url(https://chat.myrecruiter.ai/collateral/default-avatar.png)";
      });
      window.applyTestLogo = (url) => {
        console.log("🧪 Applying test logo:", url);
        document.documentElement.style.setProperty("--avatar-url", `url(${url})`);
        const img = new Image();
        img.onload = () => console.log("✅ Test logo applied successfully");
        img.onerror = () => console.log("❌ Test logo failed to load");
        img.src = url;
      };
      window.applyGenericTheme = (theme = "default") => {
        const themes = {
          default: {
            "--primary-color": "#3b82f6",
            "--message-spacing": "16px",
            "--border-radius": "12px",
            "--bubble-padding": "12px 16px",
            "--chat-width": "360px",
            "--chat-height": "540px"
          },
          modern: {
            "--primary-color": "#6366f1",
            "--message-spacing": "20px",
            "--border-radius": "16px",
            "--bubble-padding": "16px 20px",
            "--chat-width": "380px",
            "--chat-height": "580px"
          },
          compact: {
            "--primary-color": "#10b981",
            "--message-spacing": "12px",
            "--border-radius": "8px",
            "--bubble-padding": "8px 12px",
            "--chat-width": "320px",
            "--chat-height": "480px"
          }
        };
        const selectedTheme = themes[theme] || themes.default;
        Object.entries(selectedTheme).forEach(([prop, val]) => {
          document.documentElement.style.setProperty(prop, val);
        });
        console.log(`🎨 Applied ${theme} theme:`, selectedTheme);
      };
      console.log(`
🛠️  PICASSO MULTI-TENANT CSS COMMANDS:
   debugLogoBackground()         - Debug current logo background settings
   testCSS('--property', 'value') - Test any CSS variable directly
   
🧪 FEATURE COMMANDS:
   testQuickHelpToggle()         - Toggle quick help display
   testActionChipsToggle()       - Toggle action chips display
   debugAvatar()                 - Test all avatar URLs for current tenant
   applyTestLogo('url')          - Test any custom logo URL
   
🎨 THEME TESTING:
   applyGenericTheme('default')  - Apply generic theme variants
   Available themes: 'default', 'modern', 'compact'
   
📋 SYSTEM STATUS:
   All CSS variables are tenant-agnostic with generic defaults
   No hard-coded tenant-specific references
   Ready for multi-tenant deployment
`);
      window.picassoUtilities = {
        isLightColor,
        determineContrastColor,
        determineHeaderTextColor,
        generateAvatarUrl,
        hexToRgb,
        darkenColor,
        lightenColor
      };
    }
    function ChatHeader({ onClose }) {
      var _a, _b, _c2;
      const { config } = useConfig();
      const subtitle = ((_a = config == null ? void 0 : config.branding) == null ? void 0 : _a.chat_subtitle) || ((_b = config == null ? void 0 : config.branding) == null ? void 0 : _b.header_subtitle) || (config == null ? void 0 : config.chat_subtitle) || "How can we help you today?";
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-header", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-header-brand", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "chat-header-logo" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-header-text", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h3", { className: "chat-title", children: ((_c2 = config == null ? void 0 : config.branding) == null ? void 0 : _c2.chat_title) || "Chat" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "chat-subtitle", children: subtitle })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: onClose,
            className: "chat-header-close-button",
            "aria-label": "Close chat",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "w-4 h-4" })
          }
        )
      ] });
    }
    function AttachmentMenu({ onClose }) {
      const { config } = useConfig();
      const features = (config == null ? void 0 : config.features) || {};
      const { addMessage } = useChat();
      const allButtons = [
        {
          id: "file",
          label: "Upload file",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(FilePlus, { className: "w-5 h-5" }),
          enabled: features.uploads,
          // Use uploads feature toggle
          action: "file"
        },
        {
          id: "camera",
          label: "Take photo",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Camera, { className: "w-5 h-5" }),
          enabled: features.photo_uploads,
          // Use photo_uploads feature toggle
          action: "camera"
        },
        {
          id: "photo",
          label: "Upload photo",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Image$1, { className: "w-5 h-5" }),
          enabled: features.photo_uploads,
          // Use photo_uploads feature toggle
          action: "photo"
        },
        {
          id: "video",
          label: "Upload video",
          icon: /* @__PURE__ */ jsxRuntimeExports.jsx(Video, { className: "w-5 h-5" }),
          enabled: features.photo_uploads,
          // Use photo_uploads feature toggle
          action: "video"
        }
      ];
      const availableButtons = allButtons.filter((button) => button.enabled);
      if (availableButtons.length === 0) {
        return null;
      }
      const handleButtonClick = (button) => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        if (button.action === "photo" || button.action === "camera") {
          input.accept = "image/*";
          if (button.action === "camera") {
            input.capture = "environment";
          }
        } else if (button.action === "video") {
          input.accept = "video/*";
        } else {
          input.accept = "*/*";
        }
        input.onchange = () => {
          const selectedFiles = Array.from(input.files);
          if (!selectedFiles.length) return;
          const messageFiles = selectedFiles.map((file) => ({
            name: file.name,
            type: file.type,
            url: URL.createObjectURL(file)
          }));
          addMessage({
            role: "user",
            content: `📎 Uploaded ${messageFiles.length > 1 ? "files" : "file"}`,
            files: messageFiles
          });
          if (onClose) onClose();
        };
        input.click();
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "upload-menu", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "upload-menu-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "upload-menu-title", children: "Add attachment" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: onClose, className: "upload-menu-close", children: "×" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "upload-menu-grid", children: availableButtons.map((button) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: () => handleButtonClick(button),
            className: "upload-option",
            "aria-label": button.label,
            "data-type": button.id,
            children: [
              button.icon,
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: button.label })
            ]
          },
          button.id
        )) })
      ] });
    }
    function InputBar({ input, setInput }) {
      var _a;
      const { addMessage, isTyping } = useChat();
      const { config } = useConfig();
      const features = (config == null ? void 0 : config.features) || {};
      const [showAttachments, setShowAttachments] = reactExports.useState(false);
      const [uploadingFiles, setUploadingFiles] = reactExports.useState(/* @__PURE__ */ new Set());
      const textareaRef = reactExports.useRef(null);
      const [localInput, setLocalInput] = reactExports.useState("");
      const actualInput = input !== void 0 ? input : localInput;
      const actualSetInput = setInput || setLocalInput;
      const fontFamily = ((_a = config == null ? void 0 : config.branding) == null ? void 0 : _a.font_family) || "system-ui, sans-serif";
      const adjustTextareaHeight = () => {
        var _a2;
        const textarea = textareaRef.current;
        if (!textarea) return;
        const span = document.createElement("span");
        span.style.font = window.getComputedStyle(textarea).font;
        span.style.fontSize = ((_a2 = config == null ? void 0 : config.branding) == null ? void 0 : _a2.font_size) || "15px";
        span.style.fontFamily = fontFamily;
        span.style.visibility = "hidden";
        span.style.position = "absolute";
        span.style.whiteSpace = "nowrap";
        span.textContent = textarea.value || textarea.placeholder;
        document.body.appendChild(span);
        const textWidth = span.offsetWidth;
        document.body.removeChild(span);
        const textareaStyles = window.getComputedStyle(textarea);
        const paddingLeft = parseInt(textareaStyles.paddingLeft) || 0;
        const paddingRight = parseInt(textareaStyles.paddingRight) || 0;
        const availableWidth = textarea.offsetWidth - paddingLeft - paddingRight;
        if (textWidth > availableWidth) {
          textarea.style.height = "auto";
          const scrollHeight = textarea.scrollHeight;
          const maxHeight = 120;
          textarea.style.height = Math.min(scrollHeight, maxHeight) + "px";
        } else {
          textarea.style.height = "20px";
        }
      };
      reactExports.useEffect(() => {
        adjustTextareaHeight();
      }, [actualInput]);
      reactExports.useEffect(() => {
        if (textareaRef.current) {
          textareaRef.current.style.height = "20px";
        }
      }, []);
      const handleSubmit = () => {
        const trimmed = actualInput.trim();
        if (!trimmed || isTyping) return;
        addMessage({ role: "user", content: trimmed });
        actualSetInput("");
        setShowAttachments(false);
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = "20px";
          }
        }, 0);
      };
      const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
      };
      const handleInputChange = (e) => {
        actualSetInput(e.target.value);
      };
      const hasBottomRow = features.uploads || features.photo_uploads || features.voice_input;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `input-bar-container ${hasBottomRow ? "double-row" : "single-row"}`, children: [
        showAttachments && /* @__PURE__ */ jsxRuntimeExports.jsx(AttachmentMenu, { onClose: () => setShowAttachments(false) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-row-container", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `input-text-row ${!hasBottomRow ? "inline-mode" : ""}`, children: !hasBottomRow ? (
            // FIXED: Single row with inline send button
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-inline-container", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "textarea",
                {
                  ref: textareaRef,
                  id: "chat-message-input",
                  name: "message",
                  value: actualInput,
                  onChange: handleInputChange,
                  onKeyDown: handleKeyDown,
                  placeholder: "How can I help you today?",
                  autoComplete: "off",
                  className: "input-textarea inline-textarea auto-resize-textarea"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  onClick: handleSubmit,
                  disabled: !actualInput.trim() || isTyping,
                  className: `send-button inline-send ${actualInput.trim() ? "send-button-active" : "send-button-disabled"}`,
                  "aria-label": "Send",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                    ArrowRight,
                    {
                      size: 16,
                      color: actualInput.trim() ? "white" : "#94a3b8"
                    }
                  )
                }
              )
            ] })
          ) : (
            // Double row mode - textarea only
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "textarea",
              {
                ref: textareaRef,
                id: "chat-message-input",
                name: "message",
                value: actualInput,
                onChange: handleInputChange,
                onKeyDown: handleKeyDown,
                placeholder: "How can I help you today?",
                autoComplete: "off",
                className: "input-textarea"
              }
            )
          ) }),
          hasBottomRow ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-controls-row", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "input-tools", children: [
              (features.uploads || features.photo_uploads) && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  className: "input-tool-button",
                  onClick: () => setShowAttachments((prev) => !prev),
                  "aria-label": "Add Attachment",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { size: 16 })
                }
              ),
              features.voice_input && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "input-tool-button", "data-voice": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx(Mic, { size: 16 }) })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: handleSubmit,
                disabled: !actualInput.trim() || isTyping,
                className: `send-button ${actualInput.trim() ? "send-button-active" : "send-button-disabled"}`,
                "aria-label": "Send",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                  ArrowRight,
                  {
                    size: 16,
                    color: actualInput.trim() ? "white" : "#94a3b8"
                  }
                )
              }
            )
          ] }) : null
        ] })
      ] });
    }
    function FollowUpPromptBar() {
      const { addMessage, isTyping } = useChat();
      const { config } = useConfig();
      const quickHelpConfig = (config == null ? void 0 : config.quick_help) || {};
      const enabled = quickHelpConfig.enabled !== false;
      if (!enabled) return null;
      const prompts = quickHelpConfig.prompts || [
        "Tell me about volunteering",
        "Where does my donation go?",
        "How can I get involved?",
        "What volunteer opportunities are available?",
        "How can I make a donation?",
        "What impact does my support have?"
      ];
      const title = quickHelpConfig.title || "Common Questions:";
      const toggleText = quickHelpConfig.toggle_text || "Help Menu ↑";
      const closeAfterSelection = quickHelpConfig.close_after_selection !== false;
      const [animationState, setAnimationState] = React.useState("closed");
      const [toggleState, setToggleState] = React.useState("visible");
      const menuRef = React.useRef(null);
      const toggleRef = React.useRef(null);
      const handleOpen = () => {
        setToggleState("hiding");
        setAnimationState("opening");
        setTimeout(() => {
          setToggleState("hidden");
          setAnimationState("open");
        }, 10);
      };
      const handleClose = () => {
        setAnimationState("closing");
        setTimeout(() => {
          setAnimationState("closed");
          setToggleState("showing");
          setTimeout(() => setToggleState("visible"), 375);
        }, 375);
      };
      const handleClick = (prompt) => {
        if (!isTyping) {
          addMessage({ role: "user", content: prompt });
          if (closeAfterSelection) {
            handleClose();
          }
        }
      };
      React.useEffect(() => {
        const handleClickOutside = (event) => {
          if (animationState !== "open") return;
          if (menuRef.current && toggleRef.current && !menuRef.current.contains(event.target) && !toggleRef.current.contains(event.target)) {
            handleClose();
          }
        };
        if (animationState === "open") {
          document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
          document.removeEventListener("mousedown", handleClickOutside);
        };
      }, [animationState]);
      return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `quick-help-toggle-container ${toggleState !== "visible" ? toggleState : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            ref: toggleRef,
            onClick: handleOpen,
            className: `quick-help-toggle ${toggleState === "hiding" ? "opening" : ""}`,
            children: toggleText
          }
        ) }),
        animationState !== "closed" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: menuRef, className: `quick-help-container quick-help-${animationState}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: handleClose,
              className: "quick-help-close",
              "aria-label": "Close quick help",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quick-help-header", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quick-help-title", children: title }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "quick-help-grid", children: prompts.map((prompt, i) => /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => handleClick(prompt),
              className: "quick-help-button",
              children: prompt
            },
            i
          )) })
        ] })
      ] });
    }
    function ChatFooter({ brandText = "MyRecruiter" }) {
      var _a;
      const { config } = useConfig();
      const [logoError, setLogoError] = reactExports.useState(false);
      const myRecruiterLogoUrl = ((_a = config == null ? void 0 : config.branding) == null ? void 0 : _a.company_logo_url) || "https://chat.myrecruiter.ai/collateral/MyRecruiterLogo.png";
      const showLogo = !logoError;
      const handleLogoError = () => {
        console.log("❌ MyRecruiter logo failed to load:", myRecruiterLogoUrl);
        setLogoError(true);
      };
      const handleLogoLoad = () => {
        console.log("✅ MyRecruiter logo loaded successfully:", myRecruiterLogoUrl);
        setLogoError(false);
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-footer-container", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(FollowUpPromptBar, {}),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "chat-footer", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "chat-footer-content", children: [
          "Powered by",
          " ",
          showLogo ? (
            // Show MyRecruiter company logo
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: myRecruiterLogoUrl,
                onError: handleLogoError,
                onLoad: handleLogoLoad,
                alt: brandText,
                className: "chat-footer-logo"
              }
            )
          ) : (
            // Fallback to text only if MyRecruiter logo fails to load
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "chat-footer-brand-text", children: brandText })
          )
        ] }) })
      ] });
    }
    function _getDefaults() {
      return {
        async: false,
        breaks: false,
        extensions: null,
        gfm: true,
        hooks: null,
        pedantic: false,
        renderer: null,
        silent: false,
        tokenizer: null,
        walkTokens: null
      };
    }
    var _defaults = _getDefaults();
    function changeDefaults(newDefaults) {
      _defaults = newDefaults;
    }
    var noopTest = { exec: () => null };
    function edit(regex, opt = "") {
      let source = typeof regex === "string" ? regex : regex.source;
      const obj = {
        replace: (name, val) => {
          let valSource = typeof val === "string" ? val : val.source;
          valSource = valSource.replace(other.caret, "$1");
          source = source.replace(name, valSource);
          return obj;
        },
        getRegex: () => {
          return new RegExp(source, opt);
        }
      };
      return obj;
    }
    var other = {
      codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
      outputLinkReplace: /\\([\[\]])/g,
      indentCodeCompensation: /^(\s+)(?:```)/,
      beginningSpace: /^\s+/,
      endingHash: /#$/,
      startingSpaceChar: /^ /,
      endingSpaceChar: / $/,
      nonSpaceChar: /[^ ]/,
      newLineCharGlobal: /\n/g,
      tabCharGlobal: /\t/g,
      multipleSpaceGlobal: /\s+/g,
      blankLine: /^[ \t]*$/,
      doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
      blockquoteStart: /^ {0,3}>/,
      blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
      blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
      listReplaceTabs: /^\t+/,
      listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
      listIsTask: /^\[[ xX]\] /,
      listReplaceTask: /^\[[ xX]\] +/,
      anyLine: /\n.*\n/,
      hrefBrackets: /^<(.*)>$/,
      tableDelimiter: /[:|]/,
      tableAlignChars: /^\||\| *$/g,
      tableRowBlankLine: /\n[ \t]*$/,
      tableAlignRight: /^ *-+: *$/,
      tableAlignCenter: /^ *:-+: *$/,
      tableAlignLeft: /^ *:-+ *$/,
      startATag: /^<a /i,
      endATag: /^<\/a>/i,
      startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
      endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
      startAngleBracket: /^</,
      endAngleBracket: />$/,
      pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
      unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
      escapeTest: /[&<>"']/,
      escapeReplace: /[&<>"']/g,
      escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
      escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
      unescapeTest: /&(#(?:\d+)|(?:#x[0-9A-Fa-f]+)|(?:\w+));?/ig,
      caret: /(^|[^\[])\^/g,
      percentDecode: /%25/g,
      findPipe: /\|/g,
      splitPipe: / \|/,
      slashPipe: /\\\|/g,
      carriageReturn: /\r\n|\r/g,
      spaceLine: /^ +$/gm,
      notSpaceStart: /^\S*/,
      endingNewline: /\n$/,
      listItemRegex: (bull) => new RegExp(`^( {0,3}${bull})((?:[	 ][^\\n]*)?(?:\\n|$))`),
      nextBulletRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`),
      hrRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),
      fencesBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`),
      headingBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`),
      htmlBeginRegex: (indent) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}<(?:[a-z].*>|!--)`, "i")
    };
    var newline = /^(?:[ \t]*(?:\n|$))+/;
    var blockCode = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
    var fences = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
    var hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
    var heading = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
    var bullet = /(?:[*+-]|\d{1,9}[.)])/;
    var lheadingCore = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
    var lheading = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
    var lheadingGfm = edit(lheadingCore).replace(/bull/g, bullet).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
    var _paragraph = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
    var blockText = /^[^\n]+/;
    var _blockLabel = /(?!\s*\])(?:\\.|[^\[\]\\])+/;
    var def = edit(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", _blockLabel).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
    var list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, bullet).getRegex();
    var _tag = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
    var _comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
    var html$2 = edit(
      "^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))",
      "i"
    ).replace("comment", _comment).replace("tag", _tag).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
    var paragraph = edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
    var blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", paragraph).getRegex();
    var blockNormal = {
      blockquote,
      code: blockCode,
      def,
      fences,
      heading,
      hr,
      html: html$2,
      lheading,
      list,
      newline,
      paragraph,
      table: noopTest,
      text: blockText
    };
    var gfmTable = edit(
      "^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)"
    ).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex();
    var blockGfm = __spreadProps(__spreadValues({}, blockNormal), {
      lheading: lheadingGfm,
      table: gfmTable,
      paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", gfmTable).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)]) ").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", _tag).getRegex()
    });
    var blockPedantic = __spreadProps(__spreadValues({}, blockNormal), {
      html: edit(
        `^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`
      ).replace("comment", _comment).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
      def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
      heading: /^(#{1,6})(.*)(?:\n+|$)/,
      fences: noopTest,
      // fences not supported
      lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
      paragraph: edit(_paragraph).replace("hr", hr).replace("heading", " *#{1,6} *[^\n]").replace("lheading", lheading).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
    });
    var escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
    var inlineCode = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
    var br = /^( {2,}|\\)\n(?!\s*$)/;
    var inlineText = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
    var _punctuation = /[\p{P}\p{S}]/u;
    var _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
    var _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;
    var punctuation = edit(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, _punctuationOrSpace).getRegex();
    var _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
    var _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
    var _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;
    var blockSkip = /\[[^[\]]*?\]\((?:\\.|[^\\\(\)]|\((?:\\.|[^\\\(\)])*\))*\)|`[^`]*?`|<[^<>]*?>/g;
    var emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|[^\s*]))|^_+(?:((?!_)punct)|([^\s_]))/;
    var emStrongLDelim = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuation).getRegex();
    var emStrongLDelimGfm = edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuationGfmStrongEm).getRegex();
    var emStrongRDelimAstCore = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
    var emStrongRDelimAst = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
    var emStrongRDelimAstGfm = edit(emStrongRDelimAstCore, "gu").replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm).replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm).replace(/punct/g, _punctuationGfmStrongEm).getRegex();
    var emStrongRDelimUnd = edit(
      "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)",
      "gu"
    ).replace(/notPunctSpace/g, _notPunctuationOrSpace).replace(/punctSpace/g, _punctuationOrSpace).replace(/punct/g, _punctuation).getRegex();
    var anyPunctuation = edit(/\\(punct)/, "gu").replace(/punct/g, _punctuation).getRegex();
    var autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
    var _inlineComment = edit(_comment).replace("(?:-->|$)", "-->").getRegex();
    var tag = edit(
      "^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>"
    ).replace("comment", _inlineComment).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
    var _inlineLabel = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
    var link = edit(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]*(?:\n[ \t]*)?)(title))?\s*\)/).replace("label", _inlineLabel).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
    var reflink = edit(/^!?\[(label)\]\[(ref)\]/).replace("label", _inlineLabel).replace("ref", _blockLabel).getRegex();
    var nolink = edit(/^!?\[(ref)\](?:\[\])?/).replace("ref", _blockLabel).getRegex();
    var reflinkSearch = edit("reflink|nolink(?!\\()", "g").replace("reflink", reflink).replace("nolink", nolink).getRegex();
    var inlineNormal = {
      _backpedal: noopTest,
      // only used for GFM url
      anyPunctuation,
      autolink,
      blockSkip,
      br,
      code: inlineCode,
      del: noopTest,
      emStrongLDelim,
      emStrongRDelimAst,
      emStrongRDelimUnd,
      escape,
      link,
      nolink,
      punctuation,
      reflink,
      reflinkSearch,
      tag,
      text: inlineText,
      url: noopTest
    };
    var inlinePedantic = __spreadProps(__spreadValues({}, inlineNormal), {
      link: edit(/^!?\[(label)\]\((.*?)\)/).replace("label", _inlineLabel).getRegex(),
      reflink: edit(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", _inlineLabel).getRegex()
    });
    var inlineGfm = __spreadProps(__spreadValues({}, inlineNormal), {
      emStrongRDelimAst: emStrongRDelimAstGfm,
      emStrongLDelim: emStrongLDelimGfm,
      url: edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i").replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
      _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
      del: /^(~~?)(?=[^\s~])((?:\\.|[^\\])*?(?:\\.|[^\s~\\]))\1(?=[^~]|$)/,
      text: /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/
    });
    var inlineBreaks = __spreadProps(__spreadValues({}, inlineGfm), {
      br: edit(br).replace("{2,}", "*").getRegex(),
      text: edit(inlineGfm.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
    });
    var block = {
      normal: blockNormal,
      gfm: blockGfm,
      pedantic: blockPedantic
    };
    var inline = {
      normal: inlineNormal,
      gfm: inlineGfm,
      breaks: inlineBreaks,
      pedantic: inlinePedantic
    };
    var escapeReplacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    var getEscapeReplacement = (ch) => escapeReplacements[ch];
    function escape2(html2, encode) {
      if (encode) {
        if (other.escapeTest.test(html2)) {
          return html2.replace(other.escapeReplace, getEscapeReplacement);
        }
      } else {
        if (other.escapeTestNoEncode.test(html2)) {
          return html2.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
        }
      }
      return html2;
    }
    function cleanUrl(href) {
      try {
        href = encodeURI(href).replace(other.percentDecode, "%");
      } catch (e) {
        return null;
      }
      return href;
    }
    function splitCells(tableRow, count) {
      var _a;
      const row = tableRow.replace(other.findPipe, (match, offset, str) => {
        let escaped = false;
        let curr = offset;
        while (--curr >= 0 && str[curr] === "\\") escaped = !escaped;
        if (escaped) {
          return "|";
        } else {
          return " |";
        }
      }), cells = row.split(other.splitPipe);
      let i = 0;
      if (!cells[0].trim()) {
        cells.shift();
      }
      if (cells.length > 0 && !((_a = cells.at(-1)) == null ? void 0 : _a.trim())) {
        cells.pop();
      }
      if (count) {
        if (cells.length > count) {
          cells.splice(count);
        } else {
          while (cells.length < count) cells.push("");
        }
      }
      for (; i < cells.length; i++) {
        cells[i] = cells[i].trim().replace(other.slashPipe, "|");
      }
      return cells;
    }
    function rtrim(str, c, invert) {
      const l = str.length;
      if (l === 0) {
        return "";
      }
      let suffLen = 0;
      while (suffLen < l) {
        const currChar = str.charAt(l - suffLen - 1);
        if (currChar === c && true) {
          suffLen++;
        } else {
          break;
        }
      }
      return str.slice(0, l - suffLen);
    }
    function findClosingBracket(str, b) {
      if (str.indexOf(b[1]) === -1) {
        return -1;
      }
      let level = 0;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === "\\") {
          i++;
        } else if (str[i] === b[0]) {
          level++;
        } else if (str[i] === b[1]) {
          level--;
          if (level < 0) {
            return i;
          }
        }
      }
      if (level > 0) {
        return -2;
      }
      return -1;
    }
    function outputLink(cap, link2, raw, lexer2, rules) {
      const href = link2.href;
      const title = link2.title || null;
      const text2 = cap[1].replace(rules.other.outputLinkReplace, "$1");
      lexer2.state.inLink = true;
      const token = {
        type: cap[0].charAt(0) === "!" ? "image" : "link",
        raw,
        href,
        title,
        text: text2,
        tokens: lexer2.inlineTokens(text2)
      };
      lexer2.state.inLink = false;
      return token;
    }
    function indentCodeCompensation(raw, text2, rules) {
      const matchIndentToCode = raw.match(rules.other.indentCodeCompensation);
      if (matchIndentToCode === null) {
        return text2;
      }
      const indentToCode = matchIndentToCode[1];
      return text2.split("\n").map((node) => {
        const matchIndentInNode = node.match(rules.other.beginningSpace);
        if (matchIndentInNode === null) {
          return node;
        }
        const [indentInNode] = matchIndentInNode;
        if (indentInNode.length >= indentToCode.length) {
          return node.slice(indentToCode.length);
        }
        return node;
      }).join("\n");
    }
    var _Tokenizer = class {
      // set by the lexer
      constructor(options2) {
        __publicField(this, "options");
        __publicField(this, "rules");
        // set by the lexer
        __publicField(this, "lexer");
        this.options = options2 || _defaults;
      }
      space(src) {
        const cap = this.rules.block.newline.exec(src);
        if (cap && cap[0].length > 0) {
          return {
            type: "space",
            raw: cap[0]
          };
        }
      }
      code(src) {
        const cap = this.rules.block.code.exec(src);
        if (cap) {
          const text2 = cap[0].replace(this.rules.other.codeRemoveIndent, "");
          return {
            type: "code",
            raw: cap[0],
            codeBlockStyle: "indented",
            text: !this.options.pedantic ? rtrim(text2, "\n") : text2
          };
        }
      }
      fences(src) {
        const cap = this.rules.block.fences.exec(src);
        if (cap) {
          const raw = cap[0];
          const text2 = indentCodeCompensation(raw, cap[3] || "", this.rules);
          return {
            type: "code",
            raw,
            lang: cap[2] ? cap[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : cap[2],
            text: text2
          };
        }
      }
      heading(src) {
        const cap = this.rules.block.heading.exec(src);
        if (cap) {
          let text2 = cap[2].trim();
          if (this.rules.other.endingHash.test(text2)) {
            const trimmed = rtrim(text2, "#");
            if (this.options.pedantic) {
              text2 = trimmed.trim();
            } else if (!trimmed || this.rules.other.endingSpaceChar.test(trimmed)) {
              text2 = trimmed.trim();
            }
          }
          return {
            type: "heading",
            raw: cap[0],
            depth: cap[1].length,
            text: text2,
            tokens: this.lexer.inline(text2)
          };
        }
      }
      hr(src) {
        const cap = this.rules.block.hr.exec(src);
        if (cap) {
          return {
            type: "hr",
            raw: rtrim(cap[0], "\n")
          };
        }
      }
      blockquote(src) {
        const cap = this.rules.block.blockquote.exec(src);
        if (cap) {
          let lines = rtrim(cap[0], "\n").split("\n");
          let raw = "";
          let text2 = "";
          const tokens = [];
          while (lines.length > 0) {
            let inBlockquote = false;
            const currentLines = [];
            let i;
            for (i = 0; i < lines.length; i++) {
              if (this.rules.other.blockquoteStart.test(lines[i])) {
                currentLines.push(lines[i]);
                inBlockquote = true;
              } else if (!inBlockquote) {
                currentLines.push(lines[i]);
              } else {
                break;
              }
            }
            lines = lines.slice(i);
            const currentRaw = currentLines.join("\n");
            const currentText = currentRaw.replace(this.rules.other.blockquoteSetextReplace, "\n    $1").replace(this.rules.other.blockquoteSetextReplace2, "");
            raw = raw ? `${raw}
${currentRaw}` : currentRaw;
            text2 = text2 ? `${text2}
${currentText}` : currentText;
            const top = this.lexer.state.top;
            this.lexer.state.top = true;
            this.lexer.blockTokens(currentText, tokens, true);
            this.lexer.state.top = top;
            if (lines.length === 0) {
              break;
            }
            const lastToken = tokens.at(-1);
            if ((lastToken == null ? void 0 : lastToken.type) === "code") {
              break;
            } else if ((lastToken == null ? void 0 : lastToken.type) === "blockquote") {
              const oldToken = lastToken;
              const newText = oldToken.raw + "\n" + lines.join("\n");
              const newToken = this.blockquote(newText);
              tokens[tokens.length - 1] = newToken;
              raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
              text2 = text2.substring(0, text2.length - oldToken.text.length) + newToken.text;
              break;
            } else if ((lastToken == null ? void 0 : lastToken.type) === "list") {
              const oldToken = lastToken;
              const newText = oldToken.raw + "\n" + lines.join("\n");
              const newToken = this.list(newText);
              tokens[tokens.length - 1] = newToken;
              raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
              text2 = text2.substring(0, text2.length - oldToken.raw.length) + newToken.raw;
              lines = newText.substring(tokens.at(-1).raw.length).split("\n");
              continue;
            }
          }
          return {
            type: "blockquote",
            raw,
            tokens,
            text: text2
          };
        }
      }
      list(src) {
        let cap = this.rules.block.list.exec(src);
        if (cap) {
          let bull = cap[1].trim();
          const isordered = bull.length > 1;
          const list2 = {
            type: "list",
            raw: "",
            ordered: isordered,
            start: isordered ? +bull.slice(0, -1) : "",
            loose: false,
            items: []
          };
          bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;
          if (this.options.pedantic) {
            bull = isordered ? bull : "[*+-]";
          }
          const itemRegex = this.rules.other.listItemRegex(bull);
          let endsWithBlankLine = false;
          while (src) {
            let endEarly = false;
            let raw = "";
            let itemContents = "";
            if (!(cap = itemRegex.exec(src))) {
              break;
            }
            if (this.rules.block.hr.test(src)) {
              break;
            }
            raw = cap[0];
            src = src.substring(raw.length);
            let line = cap[2].split("\n", 1)[0].replace(this.rules.other.listReplaceTabs, (t) => " ".repeat(3 * t.length));
            let nextLine = src.split("\n", 1)[0];
            let blankLine = !line.trim();
            let indent = 0;
            if (this.options.pedantic) {
              indent = 2;
              itemContents = line.trimStart();
            } else if (blankLine) {
              indent = cap[1].length + 1;
            } else {
              indent = cap[2].search(this.rules.other.nonSpaceChar);
              indent = indent > 4 ? 1 : indent;
              itemContents = line.slice(indent);
              indent += cap[1].length;
            }
            if (blankLine && this.rules.other.blankLine.test(nextLine)) {
              raw += nextLine + "\n";
              src = src.substring(nextLine.length + 1);
              endEarly = true;
            }
            if (!endEarly) {
              const nextBulletRegex = this.rules.other.nextBulletRegex(indent);
              const hrRegex = this.rules.other.hrRegex(indent);
              const fencesBeginRegex = this.rules.other.fencesBeginRegex(indent);
              const headingBeginRegex = this.rules.other.headingBeginRegex(indent);
              const htmlBeginRegex = this.rules.other.htmlBeginRegex(indent);
              while (src) {
                const rawLine = src.split("\n", 1)[0];
                let nextLineWithoutTabs;
                nextLine = rawLine;
                if (this.options.pedantic) {
                  nextLine = nextLine.replace(this.rules.other.listReplaceNesting, "  ");
                  nextLineWithoutTabs = nextLine;
                } else {
                  nextLineWithoutTabs = nextLine.replace(this.rules.other.tabCharGlobal, "    ");
                }
                if (fencesBeginRegex.test(nextLine)) {
                  break;
                }
                if (headingBeginRegex.test(nextLine)) {
                  break;
                }
                if (htmlBeginRegex.test(nextLine)) {
                  break;
                }
                if (nextBulletRegex.test(nextLine)) {
                  break;
                }
                if (hrRegex.test(nextLine)) {
                  break;
                }
                if (nextLineWithoutTabs.search(this.rules.other.nonSpaceChar) >= indent || !nextLine.trim()) {
                  itemContents += "\n" + nextLineWithoutTabs.slice(indent);
                } else {
                  if (blankLine) {
                    break;
                  }
                  if (line.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4) {
                    break;
                  }
                  if (fencesBeginRegex.test(line)) {
                    break;
                  }
                  if (headingBeginRegex.test(line)) {
                    break;
                  }
                  if (hrRegex.test(line)) {
                    break;
                  }
                  itemContents += "\n" + nextLine;
                }
                if (!blankLine && !nextLine.trim()) {
                  blankLine = true;
                }
                raw += rawLine + "\n";
                src = src.substring(rawLine.length + 1);
                line = nextLineWithoutTabs.slice(indent);
              }
            }
            if (!list2.loose) {
              if (endsWithBlankLine) {
                list2.loose = true;
              } else if (this.rules.other.doubleBlankLine.test(raw)) {
                endsWithBlankLine = true;
              }
            }
            let istask = null;
            let ischecked;
            if (this.options.gfm) {
              istask = this.rules.other.listIsTask.exec(itemContents);
              if (istask) {
                ischecked = istask[0] !== "[ ] ";
                itemContents = itemContents.replace(this.rules.other.listReplaceTask, "");
              }
            }
            list2.items.push({
              type: "list_item",
              raw,
              task: !!istask,
              checked: ischecked,
              loose: false,
              text: itemContents,
              tokens: []
            });
            list2.raw += raw;
          }
          const lastItem = list2.items.at(-1);
          if (lastItem) {
            lastItem.raw = lastItem.raw.trimEnd();
            lastItem.text = lastItem.text.trimEnd();
          } else {
            return;
          }
          list2.raw = list2.raw.trimEnd();
          for (let i = 0; i < list2.items.length; i++) {
            this.lexer.state.top = false;
            list2.items[i].tokens = this.lexer.blockTokens(list2.items[i].text, []);
            if (!list2.loose) {
              const spacers = list2.items[i].tokens.filter((t) => t.type === "space");
              const hasMultipleLineBreaks = spacers.length > 0 && spacers.some((t) => this.rules.other.anyLine.test(t.raw));
              list2.loose = hasMultipleLineBreaks;
            }
          }
          if (list2.loose) {
            for (let i = 0; i < list2.items.length; i++) {
              list2.items[i].loose = true;
            }
          }
          return list2;
        }
      }
      html(src) {
        const cap = this.rules.block.html.exec(src);
        if (cap) {
          const token = {
            type: "html",
            block: true,
            raw: cap[0],
            pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
            text: cap[0]
          };
          return token;
        }
      }
      def(src) {
        const cap = this.rules.block.def.exec(src);
        if (cap) {
          const tag2 = cap[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " ");
          const href = cap[2] ? cap[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "";
          const title = cap[3] ? cap[3].substring(1, cap[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : cap[3];
          return {
            type: "def",
            tag: tag2,
            raw: cap[0],
            href,
            title
          };
        }
      }
      table(src) {
        var _a;
        const cap = this.rules.block.table.exec(src);
        if (!cap) {
          return;
        }
        if (!this.rules.other.tableDelimiter.test(cap[2])) {
          return;
        }
        const headers = splitCells(cap[1]);
        const aligns = cap[2].replace(this.rules.other.tableAlignChars, "").split("|");
        const rows = ((_a = cap[3]) == null ? void 0 : _a.trim()) ? cap[3].replace(this.rules.other.tableRowBlankLine, "").split("\n") : [];
        const item = {
          type: "table",
          raw: cap[0],
          header: [],
          align: [],
          rows: []
        };
        if (headers.length !== aligns.length) {
          return;
        }
        for (const align of aligns) {
          if (this.rules.other.tableAlignRight.test(align)) {
            item.align.push("right");
          } else if (this.rules.other.tableAlignCenter.test(align)) {
            item.align.push("center");
          } else if (this.rules.other.tableAlignLeft.test(align)) {
            item.align.push("left");
          } else {
            item.align.push(null);
          }
        }
        for (let i = 0; i < headers.length; i++) {
          item.header.push({
            text: headers[i],
            tokens: this.lexer.inline(headers[i]),
            header: true,
            align: item.align[i]
          });
        }
        for (const row of rows) {
          item.rows.push(splitCells(row, item.header.length).map((cell, i) => {
            return {
              text: cell,
              tokens: this.lexer.inline(cell),
              header: false,
              align: item.align[i]
            };
          }));
        }
        return item;
      }
      lheading(src) {
        const cap = this.rules.block.lheading.exec(src);
        if (cap) {
          return {
            type: "heading",
            raw: cap[0],
            depth: cap[2].charAt(0) === "=" ? 1 : 2,
            text: cap[1],
            tokens: this.lexer.inline(cap[1])
          };
        }
      }
      paragraph(src) {
        const cap = this.rules.block.paragraph.exec(src);
        if (cap) {
          const text2 = cap[1].charAt(cap[1].length - 1) === "\n" ? cap[1].slice(0, -1) : cap[1];
          return {
            type: "paragraph",
            raw: cap[0],
            text: text2,
            tokens: this.lexer.inline(text2)
          };
        }
      }
      text(src) {
        const cap = this.rules.block.text.exec(src);
        if (cap) {
          return {
            type: "text",
            raw: cap[0],
            text: cap[0],
            tokens: this.lexer.inline(cap[0])
          };
        }
      }
      escape(src) {
        const cap = this.rules.inline.escape.exec(src);
        if (cap) {
          return {
            type: "escape",
            raw: cap[0],
            text: cap[1]
          };
        }
      }
      tag(src) {
        const cap = this.rules.inline.tag.exec(src);
        if (cap) {
          if (!this.lexer.state.inLink && this.rules.other.startATag.test(cap[0])) {
            this.lexer.state.inLink = true;
          } else if (this.lexer.state.inLink && this.rules.other.endATag.test(cap[0])) {
            this.lexer.state.inLink = false;
          }
          if (!this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(cap[0])) {
            this.lexer.state.inRawBlock = true;
          } else if (this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(cap[0])) {
            this.lexer.state.inRawBlock = false;
          }
          return {
            type: "html",
            raw: cap[0],
            inLink: this.lexer.state.inLink,
            inRawBlock: this.lexer.state.inRawBlock,
            block: false,
            text: cap[0]
          };
        }
      }
      link(src) {
        const cap = this.rules.inline.link.exec(src);
        if (cap) {
          const trimmedUrl = cap[2].trim();
          if (!this.options.pedantic && this.rules.other.startAngleBracket.test(trimmedUrl)) {
            if (!this.rules.other.endAngleBracket.test(trimmedUrl)) {
              return;
            }
            const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
            if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
              return;
            }
          } else {
            const lastParenIndex = findClosingBracket(cap[2], "()");
            if (lastParenIndex === -2) {
              return;
            }
            if (lastParenIndex > -1) {
              const start = cap[0].indexOf("!") === 0 ? 5 : 4;
              const linkLen = start + cap[1].length + lastParenIndex;
              cap[2] = cap[2].substring(0, lastParenIndex);
              cap[0] = cap[0].substring(0, linkLen).trim();
              cap[3] = "";
            }
          }
          let href = cap[2];
          let title = "";
          if (this.options.pedantic) {
            const link2 = this.rules.other.pedanticHrefTitle.exec(href);
            if (link2) {
              href = link2[1];
              title = link2[3];
            }
          } else {
            title = cap[3] ? cap[3].slice(1, -1) : "";
          }
          href = href.trim();
          if (this.rules.other.startAngleBracket.test(href)) {
            if (this.options.pedantic && !this.rules.other.endAngleBracket.test(trimmedUrl)) {
              href = href.slice(1);
            } else {
              href = href.slice(1, -1);
            }
          }
          return outputLink(cap, {
            href: href ? href.replace(this.rules.inline.anyPunctuation, "$1") : href,
            title: title ? title.replace(this.rules.inline.anyPunctuation, "$1") : title
          }, cap[0], this.lexer, this.rules);
        }
      }
      reflink(src, links) {
        let cap;
        if ((cap = this.rules.inline.reflink.exec(src)) || (cap = this.rules.inline.nolink.exec(src))) {
          const linkString = (cap[2] || cap[1]).replace(this.rules.other.multipleSpaceGlobal, " ");
          const link2 = links[linkString.toLowerCase()];
          if (!link2) {
            const text2 = cap[0].charAt(0);
            return {
              type: "text",
              raw: text2,
              text: text2
            };
          }
          return outputLink(cap, link2, cap[0], this.lexer, this.rules);
        }
      }
      emStrong(src, maskedSrc, prevChar = "") {
        let match = this.rules.inline.emStrongLDelim.exec(src);
        if (!match) return;
        if (match[3] && prevChar.match(this.rules.other.unicodeAlphaNumeric)) return;
        const nextChar = match[1] || match[2] || "";
        if (!nextChar || !prevChar || this.rules.inline.punctuation.exec(prevChar)) {
          const lLength = [...match[0]].length - 1;
          let rDelim, rLength, delimTotal = lLength, midDelimTotal = 0;
          const endReg = match[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
          endReg.lastIndex = 0;
          maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
          while ((match = endReg.exec(maskedSrc)) != null) {
            rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];
            if (!rDelim) continue;
            rLength = [...rDelim].length;
            if (match[3] || match[4]) {
              delimTotal += rLength;
              continue;
            } else if (match[5] || match[6]) {
              if (lLength % 3 && !((lLength + rLength) % 3)) {
                midDelimTotal += rLength;
                continue;
              }
            }
            delimTotal -= rLength;
            if (delimTotal > 0) continue;
            rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
            const lastCharLength = [...match[0]][0].length;
            const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);
            if (Math.min(lLength, rLength) % 2) {
              const text22 = raw.slice(1, -1);
              return {
                type: "em",
                raw,
                text: text22,
                tokens: this.lexer.inlineTokens(text22)
              };
            }
            const text2 = raw.slice(2, -2);
            return {
              type: "strong",
              raw,
              text: text2,
              tokens: this.lexer.inlineTokens(text2)
            };
          }
        }
      }
      codespan(src) {
        const cap = this.rules.inline.code.exec(src);
        if (cap) {
          let text2 = cap[2].replace(this.rules.other.newLineCharGlobal, " ");
          const hasNonSpaceChars = this.rules.other.nonSpaceChar.test(text2);
          const hasSpaceCharsOnBothEnds = this.rules.other.startingSpaceChar.test(text2) && this.rules.other.endingSpaceChar.test(text2);
          if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
            text2 = text2.substring(1, text2.length - 1);
          }
          return {
            type: "codespan",
            raw: cap[0],
            text: text2
          };
        }
      }
      br(src) {
        const cap = this.rules.inline.br.exec(src);
        if (cap) {
          return {
            type: "br",
            raw: cap[0]
          };
        }
      }
      del(src) {
        const cap = this.rules.inline.del.exec(src);
        if (cap) {
          return {
            type: "del",
            raw: cap[0],
            text: cap[2],
            tokens: this.lexer.inlineTokens(cap[2])
          };
        }
      }
      autolink(src) {
        const cap = this.rules.inline.autolink.exec(src);
        if (cap) {
          let text2, href;
          if (cap[2] === "@") {
            text2 = cap[1];
            href = "mailto:" + text2;
          } else {
            text2 = cap[1];
            href = text2;
          }
          return {
            type: "link",
            raw: cap[0],
            text: text2,
            href,
            tokens: [
              {
                type: "text",
                raw: text2,
                text: text2
              }
            ]
          };
        }
      }
      url(src) {
        var _a, _b;
        let cap;
        if (cap = this.rules.inline.url.exec(src)) {
          let text2, href;
          if (cap[2] === "@") {
            text2 = cap[0];
            href = "mailto:" + text2;
          } else {
            let prevCapZero;
            do {
              prevCapZero = cap[0];
              cap[0] = (_b = (_a = this.rules.inline._backpedal.exec(cap[0])) == null ? void 0 : _a[0]) != null ? _b : "";
            } while (prevCapZero !== cap[0]);
            text2 = cap[0];
            if (cap[1] === "www.") {
              href = "http://" + cap[0];
            } else {
              href = cap[0];
            }
          }
          return {
            type: "link",
            raw: cap[0],
            text: text2,
            href,
            tokens: [
              {
                type: "text",
                raw: text2,
                text: text2
              }
            ]
          };
        }
      }
      inlineText(src) {
        const cap = this.rules.inline.text.exec(src);
        if (cap) {
          const escaped = this.lexer.state.inRawBlock;
          return {
            type: "text",
            raw: cap[0],
            text: cap[0],
            escaped
          };
        }
      }
    };
    var _Lexer = class __Lexer {
      constructor(options2) {
        __publicField(this, "tokens");
        __publicField(this, "options");
        __publicField(this, "state");
        __publicField(this, "tokenizer");
        __publicField(this, "inlineQueue");
        this.tokens = [];
        this.tokens.links = /* @__PURE__ */ Object.create(null);
        this.options = options2 || _defaults;
        this.options.tokenizer = this.options.tokenizer || new _Tokenizer();
        this.tokenizer = this.options.tokenizer;
        this.tokenizer.options = this.options;
        this.tokenizer.lexer = this;
        this.inlineQueue = [];
        this.state = {
          inLink: false,
          inRawBlock: false,
          top: true
        };
        const rules = {
          other,
          block: block.normal,
          inline: inline.normal
        };
        if (this.options.pedantic) {
          rules.block = block.pedantic;
          rules.inline = inline.pedantic;
        } else if (this.options.gfm) {
          rules.block = block.gfm;
          if (this.options.breaks) {
            rules.inline = inline.breaks;
          } else {
            rules.inline = inline.gfm;
          }
        }
        this.tokenizer.rules = rules;
      }
      /**
       * Expose Rules
       */
      static get rules() {
        return {
          block,
          inline
        };
      }
      /**
       * Static Lex Method
       */
      static lex(src, options2) {
        const lexer2 = new __Lexer(options2);
        return lexer2.lex(src);
      }
      /**
       * Static Lex Inline Method
       */
      static lexInline(src, options2) {
        const lexer2 = new __Lexer(options2);
        return lexer2.inlineTokens(src);
      }
      /**
       * Preprocessing
       */
      lex(src) {
        src = src.replace(other.carriageReturn, "\n");
        this.blockTokens(src, this.tokens);
        for (let i = 0; i < this.inlineQueue.length; i++) {
          const next = this.inlineQueue[i];
          this.inlineTokens(next.src, next.tokens);
        }
        this.inlineQueue = [];
        return this.tokens;
      }
      blockTokens(src, tokens = [], lastParagraphClipped = false) {
        var _a, _b, _c2;
        if (this.options.pedantic) {
          src = src.replace(other.tabCharGlobal, "    ").replace(other.spaceLine, "");
        }
        while (src) {
          let token;
          if ((_b = (_a = this.options.extensions) == null ? void 0 : _a.block) == null ? void 0 : _b.some((extTokenizer) => {
            if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
              src = src.substring(token.raw.length);
              tokens.push(token);
              return true;
            }
            return false;
          })) {
            continue;
          }
          if (token = this.tokenizer.space(src)) {
            src = src.substring(token.raw.length);
            const lastToken = tokens.at(-1);
            if (token.raw.length === 1 && lastToken !== void 0) {
              lastToken.raw += "\n";
            } else {
              tokens.push(token);
            }
            continue;
          }
          if (token = this.tokenizer.code(src)) {
            src = src.substring(token.raw.length);
            const lastToken = tokens.at(-1);
            if ((lastToken == null ? void 0 : lastToken.type) === "paragraph" || (lastToken == null ? void 0 : lastToken.type) === "text") {
              lastToken.raw += "\n" + token.raw;
              lastToken.text += "\n" + token.text;
              this.inlineQueue.at(-1).src = lastToken.text;
            } else {
              tokens.push(token);
            }
            continue;
          }
          if (token = this.tokenizer.fences(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.heading(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.hr(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.blockquote(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.list(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.html(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.def(src)) {
            src = src.substring(token.raw.length);
            const lastToken = tokens.at(-1);
            if ((lastToken == null ? void 0 : lastToken.type) === "paragraph" || (lastToken == null ? void 0 : lastToken.type) === "text") {
              lastToken.raw += "\n" + token.raw;
              lastToken.text += "\n" + token.raw;
              this.inlineQueue.at(-1).src = lastToken.text;
            } else if (!this.tokens.links[token.tag]) {
              this.tokens.links[token.tag] = {
                href: token.href,
                title: token.title
              };
            }
            continue;
          }
          if (token = this.tokenizer.table(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.lheading(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          let cutSrc = src;
          if ((_c2 = this.options.extensions) == null ? void 0 : _c2.startBlock) {
            let startIndex = Infinity;
            const tempSrc = src.slice(1);
            let tempStart;
            this.options.extensions.startBlock.forEach((getStartIndex) => {
              tempStart = getStartIndex.call({ lexer: this }, tempSrc);
              if (typeof tempStart === "number" && tempStart >= 0) {
                startIndex = Math.min(startIndex, tempStart);
              }
            });
            if (startIndex < Infinity && startIndex >= 0) {
              cutSrc = src.substring(0, startIndex + 1);
            }
          }
          if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
            const lastToken = tokens.at(-1);
            if (lastParagraphClipped && (lastToken == null ? void 0 : lastToken.type) === "paragraph") {
              lastToken.raw += "\n" + token.raw;
              lastToken.text += "\n" + token.text;
              this.inlineQueue.pop();
              this.inlineQueue.at(-1).src = lastToken.text;
            } else {
              tokens.push(token);
            }
            lastParagraphClipped = cutSrc.length !== src.length;
            src = src.substring(token.raw.length);
            continue;
          }
          if (token = this.tokenizer.text(src)) {
            src = src.substring(token.raw.length);
            const lastToken = tokens.at(-1);
            if ((lastToken == null ? void 0 : lastToken.type) === "text") {
              lastToken.raw += "\n" + token.raw;
              lastToken.text += "\n" + token.text;
              this.inlineQueue.pop();
              this.inlineQueue.at(-1).src = lastToken.text;
            } else {
              tokens.push(token);
            }
            continue;
          }
          if (src) {
            const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
            if (this.options.silent) {
              console.error(errMsg);
              break;
            } else {
              throw new Error(errMsg);
            }
          }
        }
        this.state.top = true;
        return tokens;
      }
      inline(src, tokens = []) {
        this.inlineQueue.push({ src, tokens });
        return tokens;
      }
      /**
       * Lexing/Compiling
       */
      inlineTokens(src, tokens = []) {
        var _a, _b, _c2;
        let maskedSrc = src;
        let match = null;
        if (this.tokens.links) {
          const links = Object.keys(this.tokens.links);
          if (links.length > 0) {
            while ((match = this.tokenizer.rules.inline.reflinkSearch.exec(maskedSrc)) != null) {
              if (links.includes(match[0].slice(match[0].lastIndexOf("[") + 1, -1))) {
                maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex);
              }
            }
          }
        }
        while ((match = this.tokenizer.rules.inline.anyPunctuation.exec(maskedSrc)) != null) {
          maskedSrc = maskedSrc.slice(0, match.index) + "++" + maskedSrc.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
        }
        while ((match = this.tokenizer.rules.inline.blockSkip.exec(maskedSrc)) != null) {
          maskedSrc = maskedSrc.slice(0, match.index) + "[" + "a".repeat(match[0].length - 2) + "]" + maskedSrc.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
        }
        let keepPrevChar = false;
        let prevChar = "";
        while (src) {
          if (!keepPrevChar) {
            prevChar = "";
          }
          keepPrevChar = false;
          let token;
          if ((_b = (_a = this.options.extensions) == null ? void 0 : _a.inline) == null ? void 0 : _b.some((extTokenizer) => {
            if (token = extTokenizer.call({ lexer: this }, src, tokens)) {
              src = src.substring(token.raw.length);
              tokens.push(token);
              return true;
            }
            return false;
          })) {
            continue;
          }
          if (token = this.tokenizer.escape(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.tag(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.link(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.reflink(src, this.tokens.links)) {
            src = src.substring(token.raw.length);
            const lastToken = tokens.at(-1);
            if (token.type === "text" && (lastToken == null ? void 0 : lastToken.type) === "text") {
              lastToken.raw += token.raw;
              lastToken.text += token.text;
            } else {
              tokens.push(token);
            }
            continue;
          }
          if (token = this.tokenizer.emStrong(src, maskedSrc, prevChar)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.codespan(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.br(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.del(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (token = this.tokenizer.autolink(src)) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          if (!this.state.inLink && (token = this.tokenizer.url(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
          }
          let cutSrc = src;
          if ((_c2 = this.options.extensions) == null ? void 0 : _c2.startInline) {
            let startIndex = Infinity;
            const tempSrc = src.slice(1);
            let tempStart;
            this.options.extensions.startInline.forEach((getStartIndex) => {
              tempStart = getStartIndex.call({ lexer: this }, tempSrc);
              if (typeof tempStart === "number" && tempStart >= 0) {
                startIndex = Math.min(startIndex, tempStart);
              }
            });
            if (startIndex < Infinity && startIndex >= 0) {
              cutSrc = src.substring(0, startIndex + 1);
            }
          }
          if (token = this.tokenizer.inlineText(cutSrc)) {
            src = src.substring(token.raw.length);
            if (token.raw.slice(-1) !== "_") {
              prevChar = token.raw.slice(-1);
            }
            keepPrevChar = true;
            const lastToken = tokens.at(-1);
            if ((lastToken == null ? void 0 : lastToken.type) === "text") {
              lastToken.raw += token.raw;
              lastToken.text += token.text;
            } else {
              tokens.push(token);
            }
            continue;
          }
          if (src) {
            const errMsg = "Infinite loop on byte: " + src.charCodeAt(0);
            if (this.options.silent) {
              console.error(errMsg);
              break;
            } else {
              throw new Error(errMsg);
            }
          }
        }
        return tokens;
      }
    };
    var _Renderer = class {
      // set by the parser
      constructor(options2) {
        __publicField(this, "options");
        __publicField(this, "parser");
        this.options = options2 || _defaults;
      }
      space(token) {
        return "";
      }
      code({ text: text2, lang, escaped }) {
        var _a;
        const langString = (_a = (lang || "").match(other.notSpaceStart)) == null ? void 0 : _a[0];
        const code = text2.replace(other.endingNewline, "") + "\n";
        if (!langString) {
          return "<pre><code>" + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
        }
        return '<pre><code class="language-' + escape2(langString) + '">' + (escaped ? code : escape2(code, true)) + "</code></pre>\n";
      }
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens);
        return `<blockquote>
${body}</blockquote>
`;
      }
      html({ text: text2 }) {
        return text2;
      }
      heading({ tokens, depth }) {
        return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>
`;
      }
      hr(token) {
        return "<hr>\n";
      }
      list(token) {
        const ordered = token.ordered;
        const start = token.start;
        let body = "";
        for (let j = 0; j < token.items.length; j++) {
          const item = token.items[j];
          body += this.listitem(item);
        }
        const type = ordered ? "ol" : "ul";
        const startAttr = ordered && start !== 1 ? ' start="' + start + '"' : "";
        return "<" + type + startAttr + ">\n" + body + "</" + type + ">\n";
      }
      listitem(item) {
        var _a;
        let itemBody = "";
        if (item.task) {
          const checkbox = this.checkbox({ checked: !!item.checked });
          if (item.loose) {
            if (((_a = item.tokens[0]) == null ? void 0 : _a.type) === "paragraph") {
              item.tokens[0].text = checkbox + " " + item.tokens[0].text;
              if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === "text") {
                item.tokens[0].tokens[0].text = checkbox + " " + escape2(item.tokens[0].tokens[0].text);
                item.tokens[0].tokens[0].escaped = true;
              }
            } else {
              item.tokens.unshift({
                type: "text",
                raw: checkbox + " ",
                text: checkbox + " ",
                escaped: true
              });
            }
          } else {
            itemBody += checkbox + " ";
          }
        }
        itemBody += this.parser.parse(item.tokens, !!item.loose);
        return `<li>${itemBody}</li>
`;
      }
      checkbox({ checked }) {
        return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
      }
      paragraph({ tokens }) {
        return `<p>${this.parser.parseInline(tokens)}</p>
`;
      }
      table(token) {
        let header = "";
        let cell = "";
        for (let j = 0; j < token.header.length; j++) {
          cell += this.tablecell(token.header[j]);
        }
        header += this.tablerow({ text: cell });
        let body = "";
        for (let j = 0; j < token.rows.length; j++) {
          const row = token.rows[j];
          cell = "";
          for (let k = 0; k < row.length; k++) {
            cell += this.tablecell(row[k]);
          }
          body += this.tablerow({ text: cell });
        }
        if (body) body = `<tbody>${body}</tbody>`;
        return "<table>\n<thead>\n" + header + "</thead>\n" + body + "</table>\n";
      }
      tablerow({ text: text2 }) {
        return `<tr>
${text2}</tr>
`;
      }
      tablecell(token) {
        const content = this.parser.parseInline(token.tokens);
        const type = token.header ? "th" : "td";
        const tag2 = token.align ? `<${type} align="${token.align}">` : `<${type}>`;
        return tag2 + content + `</${type}>
`;
      }
      /**
       * span level renderer
       */
      strong({ tokens }) {
        return `<strong>${this.parser.parseInline(tokens)}</strong>`;
      }
      em({ tokens }) {
        return `<em>${this.parser.parseInline(tokens)}</em>`;
      }
      codespan({ text: text2 }) {
        return `<code>${escape2(text2, true)}</code>`;
      }
      br(token) {
        return "<br>";
      }
      del({ tokens }) {
        return `<del>${this.parser.parseInline(tokens)}</del>`;
      }
      link({ href, title, tokens }) {
        const text2 = this.parser.parseInline(tokens);
        const cleanHref = cleanUrl(href);
        if (cleanHref === null) {
          return text2;
        }
        href = cleanHref;
        let out = '<a href="' + href + '"';
        if (title) {
          out += ' title="' + escape2(title) + '"';
        }
        out += ">" + text2 + "</a>";
        return out;
      }
      image({ href, title, text: text2, tokens }) {
        if (tokens) {
          text2 = this.parser.parseInline(tokens, this.parser.textRenderer);
        }
        const cleanHref = cleanUrl(href);
        if (cleanHref === null) {
          return escape2(text2);
        }
        href = cleanHref;
        let out = `<img src="${href}" alt="${text2}"`;
        if (title) {
          out += ` title="${escape2(title)}"`;
        }
        out += ">";
        return out;
      }
      text(token) {
        return "tokens" in token && token.tokens ? this.parser.parseInline(token.tokens) : "escaped" in token && token.escaped ? token.text : escape2(token.text);
      }
    };
    var _TextRenderer = class {
      // no need for block level renderers
      strong({ text: text2 }) {
        return text2;
      }
      em({ text: text2 }) {
        return text2;
      }
      codespan({ text: text2 }) {
        return text2;
      }
      del({ text: text2 }) {
        return text2;
      }
      html({ text: text2 }) {
        return text2;
      }
      text({ text: text2 }) {
        return text2;
      }
      link({ text: text2 }) {
        return "" + text2;
      }
      image({ text: text2 }) {
        return "" + text2;
      }
      br() {
        return "";
      }
    };
    var _Parser = class __Parser {
      constructor(options2) {
        __publicField(this, "options");
        __publicField(this, "renderer");
        __publicField(this, "textRenderer");
        this.options = options2 || _defaults;
        this.options.renderer = this.options.renderer || new _Renderer();
        this.renderer = this.options.renderer;
        this.renderer.options = this.options;
        this.renderer.parser = this;
        this.textRenderer = new _TextRenderer();
      }
      /**
       * Static Parse Method
       */
      static parse(tokens, options2) {
        const parser2 = new __Parser(options2);
        return parser2.parse(tokens);
      }
      /**
       * Static Parse Inline Method
       */
      static parseInline(tokens, options2) {
        const parser2 = new __Parser(options2);
        return parser2.parseInline(tokens);
      }
      /**
       * Parse Loop
       */
      parse(tokens, top = true) {
        var _a, _b;
        let out = "";
        for (let i = 0; i < tokens.length; i++) {
          const anyToken = tokens[i];
          if ((_b = (_a = this.options.extensions) == null ? void 0 : _a.renderers) == null ? void 0 : _b[anyToken.type]) {
            const genericToken = anyToken;
            const ret = this.options.extensions.renderers[genericToken.type].call({ parser: this }, genericToken);
            if (ret !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "paragraph", "text"].includes(genericToken.type)) {
              out += ret || "";
              continue;
            }
          }
          const token = anyToken;
          switch (token.type) {
            case "space": {
              out += this.renderer.space(token);
              continue;
            }
            case "hr": {
              out += this.renderer.hr(token);
              continue;
            }
            case "heading": {
              out += this.renderer.heading(token);
              continue;
            }
            case "code": {
              out += this.renderer.code(token);
              continue;
            }
            case "table": {
              out += this.renderer.table(token);
              continue;
            }
            case "blockquote": {
              out += this.renderer.blockquote(token);
              continue;
            }
            case "list": {
              out += this.renderer.list(token);
              continue;
            }
            case "html": {
              out += this.renderer.html(token);
              continue;
            }
            case "paragraph": {
              out += this.renderer.paragraph(token);
              continue;
            }
            case "text": {
              let textToken = token;
              let body = this.renderer.text(textToken);
              while (i + 1 < tokens.length && tokens[i + 1].type === "text") {
                textToken = tokens[++i];
                body += "\n" + this.renderer.text(textToken);
              }
              if (top) {
                out += this.renderer.paragraph({
                  type: "paragraph",
                  raw: body,
                  text: body,
                  tokens: [{ type: "text", raw: body, text: body, escaped: true }]
                });
              } else {
                out += body;
              }
              continue;
            }
            default: {
              const errMsg = 'Token with "' + token.type + '" type was not found.';
              if (this.options.silent) {
                console.error(errMsg);
                return "";
              } else {
                throw new Error(errMsg);
              }
            }
          }
        }
        return out;
      }
      /**
       * Parse Inline Tokens
       */
      parseInline(tokens, renderer = this.renderer) {
        var _a, _b;
        let out = "";
        for (let i = 0; i < tokens.length; i++) {
          const anyToken = tokens[i];
          if ((_b = (_a = this.options.extensions) == null ? void 0 : _a.renderers) == null ? void 0 : _b[anyToken.type]) {
            const ret = this.options.extensions.renderers[anyToken.type].call({ parser: this }, anyToken);
            if (ret !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(anyToken.type)) {
              out += ret || "";
              continue;
            }
          }
          const token = anyToken;
          switch (token.type) {
            case "escape": {
              out += renderer.text(token);
              break;
            }
            case "html": {
              out += renderer.html(token);
              break;
            }
            case "link": {
              out += renderer.link(token);
              break;
            }
            case "image": {
              out += renderer.image(token);
              break;
            }
            case "strong": {
              out += renderer.strong(token);
              break;
            }
            case "em": {
              out += renderer.em(token);
              break;
            }
            case "codespan": {
              out += renderer.codespan(token);
              break;
            }
            case "br": {
              out += renderer.br(token);
              break;
            }
            case "del": {
              out += renderer.del(token);
              break;
            }
            case "text": {
              out += renderer.text(token);
              break;
            }
            default: {
              const errMsg = 'Token with "' + token.type + '" type was not found.';
              if (this.options.silent) {
                console.error(errMsg);
                return "";
              } else {
                throw new Error(errMsg);
              }
            }
          }
        }
        return out;
      }
    };
    var _Hooks = (_c = class {
      constructor(options2) {
        __publicField(this, "options");
        __publicField(this, "block");
        this.options = options2 || _defaults;
      }
      /**
       * Process markdown before marked
       */
      preprocess(markdown) {
        return markdown;
      }
      /**
       * Process HTML after marked is finished
       */
      postprocess(html2) {
        return html2;
      }
      /**
       * Process all tokens before walk tokens
       */
      processAllTokens(tokens) {
        return tokens;
      }
      /**
       * Provide function to tokenize markdown
       */
      provideLexer() {
        return this.block ? _Lexer.lex : _Lexer.lexInline;
      }
      /**
       * Provide function to parse tokens
       */
      provideParser() {
        return this.block ? _Parser.parse : _Parser.parseInline;
      }
    }, __publicField(_c, "passThroughHooks", /* @__PURE__ */ new Set([
      "preprocess",
      "postprocess",
      "processAllTokens"
    ])), _c);
    var Marked = class {
      constructor(...args) {
        __publicField(this, "defaults", _getDefaults());
        __publicField(this, "options", this.setOptions);
        __publicField(this, "parse", this.parseMarkdown(true));
        __publicField(this, "parseInline", this.parseMarkdown(false));
        __publicField(this, "Parser", _Parser);
        __publicField(this, "Renderer", _Renderer);
        __publicField(this, "TextRenderer", _TextRenderer);
        __publicField(this, "Lexer", _Lexer);
        __publicField(this, "Tokenizer", _Tokenizer);
        __publicField(this, "Hooks", _Hooks);
        this.use(...args);
      }
      /**
       * Run callback for every token
       */
      walkTokens(tokens, callback) {
        var _a, _b;
        let values = [];
        for (const token of tokens) {
          values = values.concat(callback.call(this, token));
          switch (token.type) {
            case "table": {
              const tableToken = token;
              for (const cell of tableToken.header) {
                values = values.concat(this.walkTokens(cell.tokens, callback));
              }
              for (const row of tableToken.rows) {
                for (const cell of row) {
                  values = values.concat(this.walkTokens(cell.tokens, callback));
                }
              }
              break;
            }
            case "list": {
              const listToken = token;
              values = values.concat(this.walkTokens(listToken.items, callback));
              break;
            }
            default: {
              const genericToken = token;
              if ((_b = (_a = this.defaults.extensions) == null ? void 0 : _a.childTokens) == null ? void 0 : _b[genericToken.type]) {
                this.defaults.extensions.childTokens[genericToken.type].forEach((childTokens) => {
                  const tokens2 = genericToken[childTokens].flat(Infinity);
                  values = values.concat(this.walkTokens(tokens2, callback));
                });
              } else if (genericToken.tokens) {
                values = values.concat(this.walkTokens(genericToken.tokens, callback));
              }
            }
          }
        }
        return values;
      }
      use(...args) {
        const extensions = this.defaults.extensions || { renderers: {}, childTokens: {} };
        args.forEach((pack) => {
          const opts = __spreadValues({}, pack);
          opts.async = this.defaults.async || opts.async || false;
          if (pack.extensions) {
            pack.extensions.forEach((ext) => {
              if (!ext.name) {
                throw new Error("extension name required");
              }
              if ("renderer" in ext) {
                const prevRenderer = extensions.renderers[ext.name];
                if (prevRenderer) {
                  extensions.renderers[ext.name] = function(...args2) {
                    let ret = ext.renderer.apply(this, args2);
                    if (ret === false) {
                      ret = prevRenderer.apply(this, args2);
                    }
                    return ret;
                  };
                } else {
                  extensions.renderers[ext.name] = ext.renderer;
                }
              }
              if ("tokenizer" in ext) {
                if (!ext.level || ext.level !== "block" && ext.level !== "inline") {
                  throw new Error("extension level must be 'block' or 'inline'");
                }
                const extLevel = extensions[ext.level];
                if (extLevel) {
                  extLevel.unshift(ext.tokenizer);
                } else {
                  extensions[ext.level] = [ext.tokenizer];
                }
                if (ext.start) {
                  if (ext.level === "block") {
                    if (extensions.startBlock) {
                      extensions.startBlock.push(ext.start);
                    } else {
                      extensions.startBlock = [ext.start];
                    }
                  } else if (ext.level === "inline") {
                    if (extensions.startInline) {
                      extensions.startInline.push(ext.start);
                    } else {
                      extensions.startInline = [ext.start];
                    }
                  }
                }
              }
              if ("childTokens" in ext && ext.childTokens) {
                extensions.childTokens[ext.name] = ext.childTokens;
              }
            });
            opts.extensions = extensions;
          }
          if (pack.renderer) {
            const renderer = this.defaults.renderer || new _Renderer(this.defaults);
            for (const prop in pack.renderer) {
              if (!(prop in renderer)) {
                throw new Error(`renderer '${prop}' does not exist`);
              }
              if (["options", "parser"].includes(prop)) {
                continue;
              }
              const rendererProp = prop;
              const rendererFunc = pack.renderer[rendererProp];
              const prevRenderer = renderer[rendererProp];
              renderer[rendererProp] = (...args2) => {
                let ret = rendererFunc.apply(renderer, args2);
                if (ret === false) {
                  ret = prevRenderer.apply(renderer, args2);
                }
                return ret || "";
              };
            }
            opts.renderer = renderer;
          }
          if (pack.tokenizer) {
            const tokenizer = this.defaults.tokenizer || new _Tokenizer(this.defaults);
            for (const prop in pack.tokenizer) {
              if (!(prop in tokenizer)) {
                throw new Error(`tokenizer '${prop}' does not exist`);
              }
              if (["options", "rules", "lexer"].includes(prop)) {
                continue;
              }
              const tokenizerProp = prop;
              const tokenizerFunc = pack.tokenizer[tokenizerProp];
              const prevTokenizer = tokenizer[tokenizerProp];
              tokenizer[tokenizerProp] = (...args2) => {
                let ret = tokenizerFunc.apply(tokenizer, args2);
                if (ret === false) {
                  ret = prevTokenizer.apply(tokenizer, args2);
                }
                return ret;
              };
            }
            opts.tokenizer = tokenizer;
          }
          if (pack.hooks) {
            const hooks = this.defaults.hooks || new _Hooks();
            for (const prop in pack.hooks) {
              if (!(prop in hooks)) {
                throw new Error(`hook '${prop}' does not exist`);
              }
              if (["options", "block"].includes(prop)) {
                continue;
              }
              const hooksProp = prop;
              const hooksFunc = pack.hooks[hooksProp];
              const prevHook = hooks[hooksProp];
              if (_Hooks.passThroughHooks.has(prop)) {
                hooks[hooksProp] = (arg) => {
                  if (this.defaults.async) {
                    return Promise.resolve(hooksFunc.call(hooks, arg)).then((ret2) => {
                      return prevHook.call(hooks, ret2);
                    });
                  }
                  const ret = hooksFunc.call(hooks, arg);
                  return prevHook.call(hooks, ret);
                };
              } else {
                hooks[hooksProp] = (...args2) => {
                  let ret = hooksFunc.apply(hooks, args2);
                  if (ret === false) {
                    ret = prevHook.apply(hooks, args2);
                  }
                  return ret;
                };
              }
            }
            opts.hooks = hooks;
          }
          if (pack.walkTokens) {
            const walkTokens2 = this.defaults.walkTokens;
            const packWalktokens = pack.walkTokens;
            opts.walkTokens = function(token) {
              let values = [];
              values.push(packWalktokens.call(this, token));
              if (walkTokens2) {
                values = values.concat(walkTokens2.call(this, token));
              }
              return values;
            };
          }
          this.defaults = __spreadValues(__spreadValues({}, this.defaults), opts);
        });
        return this;
      }
      setOptions(opt) {
        this.defaults = __spreadValues(__spreadValues({}, this.defaults), opt);
        return this;
      }
      lexer(src, options2) {
        return _Lexer.lex(src, options2 != null ? options2 : this.defaults);
      }
      parser(tokens, options2) {
        return _Parser.parse(tokens, options2 != null ? options2 : this.defaults);
      }
      parseMarkdown(blockType) {
        const parse2 = (src, options2) => {
          const origOpt = __spreadValues({}, options2);
          const opt = __spreadValues(__spreadValues({}, this.defaults), origOpt);
          const throwError = this.onError(!!opt.silent, !!opt.async);
          if (this.defaults.async === true && origOpt.async === false) {
            return throwError(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
          }
          if (typeof src === "undefined" || src === null) {
            return throwError(new Error("marked(): input parameter is undefined or null"));
          }
          if (typeof src !== "string") {
            return throwError(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(src) + ", string expected"));
          }
          if (opt.hooks) {
            opt.hooks.options = opt;
            opt.hooks.block = blockType;
          }
          const lexer2 = opt.hooks ? opt.hooks.provideLexer() : blockType ? _Lexer.lex : _Lexer.lexInline;
          const parser2 = opt.hooks ? opt.hooks.provideParser() : blockType ? _Parser.parse : _Parser.parseInline;
          if (opt.async) {
            return Promise.resolve(opt.hooks ? opt.hooks.preprocess(src) : src).then((src2) => lexer2(src2, opt)).then((tokens) => opt.hooks ? opt.hooks.processAllTokens(tokens) : tokens).then((tokens) => opt.walkTokens ? Promise.all(this.walkTokens(tokens, opt.walkTokens)).then(() => tokens) : tokens).then((tokens) => parser2(tokens, opt)).then((html2) => opt.hooks ? opt.hooks.postprocess(html2) : html2).catch(throwError);
          }
          try {
            if (opt.hooks) {
              src = opt.hooks.preprocess(src);
            }
            let tokens = lexer2(src, opt);
            if (opt.hooks) {
              tokens = opt.hooks.processAllTokens(tokens);
            }
            if (opt.walkTokens) {
              this.walkTokens(tokens, opt.walkTokens);
            }
            let html2 = parser2(tokens, opt);
            if (opt.hooks) {
              html2 = opt.hooks.postprocess(html2);
            }
            return html2;
          } catch (e) {
            return throwError(e);
          }
        };
        return parse2;
      }
      onError(silent, async) {
        return (e) => {
          e.message += "\nPlease report this to https://github.com/markedjs/marked.";
          if (silent) {
            const msg = "<p>An error occurred:</p><pre>" + escape2(e.message + "", true) + "</pre>";
            if (async) {
              return Promise.resolve(msg);
            }
            return msg;
          }
          if (async) {
            return Promise.reject(e);
          }
          throw e;
        };
      }
    };
    var markedInstance = new Marked();
    function marked(src, opt) {
      return markedInstance.parse(src, opt);
    }
    marked.options = marked.setOptions = function(options2) {
      markedInstance.setOptions(options2);
      marked.defaults = markedInstance.defaults;
      changeDefaults(marked.defaults);
      return marked;
    };
    marked.getDefaults = _getDefaults;
    marked.defaults = _defaults;
    marked.use = function(...args) {
      markedInstance.use(...args);
      marked.defaults = markedInstance.defaults;
      changeDefaults(marked.defaults);
      return marked;
    };
    marked.walkTokens = function(tokens, callback) {
      return markedInstance.walkTokens(tokens, callback);
    };
    marked.parseInline = markedInstance.parseInline;
    marked.Parser = _Parser;
    marked.parser = _Parser.parse;
    marked.Renderer = _Renderer;
    marked.TextRenderer = _TextRenderer;
    marked.Lexer = _Lexer;
    marked.lexer = _Lexer.lex;
    marked.Tokenizer = _Tokenizer;
    marked.Hooks = _Hooks;
    marked.parse = marked;
    marked.options;
    marked.setOptions;
    marked.use;
    marked.walkTokens;
    marked.parseInline;
    _Parser.parse;
    _Lexer.lex;
    /*! @license DOMPurify 3.2.6 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.2.6/LICENSE */
    const {
      entries,
      setPrototypeOf,
      isFrozen,
      getPrototypeOf,
      getOwnPropertyDescriptor
    } = Object;
    let {
      freeze,
      seal,
      create
    } = Object;
    let {
      apply,
      construct
    } = typeof Reflect !== "undefined" && Reflect;
    if (!freeze) {
      freeze = function freeze2(x) {
        return x;
      };
    }
    if (!seal) {
      seal = function seal2(x) {
        return x;
      };
    }
    if (!apply) {
      apply = function apply2(fun, thisValue, args) {
        return fun.apply(thisValue, args);
      };
    }
    if (!construct) {
      construct = function construct2(Func, args) {
        return new Func(...args);
      };
    }
    const arrayForEach = unapply(Array.prototype.forEach);
    const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
    const arrayPop = unapply(Array.prototype.pop);
    const arrayPush = unapply(Array.prototype.push);
    const arraySplice = unapply(Array.prototype.splice);
    const stringToLowerCase = unapply(String.prototype.toLowerCase);
    const stringToString = unapply(String.prototype.toString);
    const stringMatch = unapply(String.prototype.match);
    const stringReplace = unapply(String.prototype.replace);
    const stringIndexOf = unapply(String.prototype.indexOf);
    const stringTrim = unapply(String.prototype.trim);
    const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
    const regExpTest = unapply(RegExp.prototype.test);
    const typeErrorCreate = unconstruct(TypeError);
    function unapply(func) {
      return function(thisArg) {
        if (thisArg instanceof RegExp) {
          thisArg.lastIndex = 0;
        }
        for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
          args[_key - 1] = arguments[_key];
        }
        return apply(func, thisArg, args);
      };
    }
    function unconstruct(func) {
      return function() {
        for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
          args[_key2] = arguments[_key2];
        }
        return construct(func, args);
      };
    }
    function addToSet(set, array) {
      let transformCaseFunc = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : stringToLowerCase;
      if (setPrototypeOf) {
        setPrototypeOf(set, null);
      }
      let l = array.length;
      while (l--) {
        let element = array[l];
        if (typeof element === "string") {
          const lcElement = transformCaseFunc(element);
          if (lcElement !== element) {
            if (!isFrozen(array)) {
              array[l] = lcElement;
            }
            element = lcElement;
          }
        }
        set[element] = true;
      }
      return set;
    }
    function cleanArray(array) {
      for (let index = 0; index < array.length; index++) {
        const isPropertyExist = objectHasOwnProperty(array, index);
        if (!isPropertyExist) {
          array[index] = null;
        }
      }
      return array;
    }
    function clone(object) {
      const newObject = create(null);
      for (const [property, value] of entries(object)) {
        const isPropertyExist = objectHasOwnProperty(object, property);
        if (isPropertyExist) {
          if (Array.isArray(value)) {
            newObject[property] = cleanArray(value);
          } else if (value && typeof value === "object" && value.constructor === Object) {
            newObject[property] = clone(value);
          } else {
            newObject[property] = value;
          }
        }
      }
      return newObject;
    }
    function lookupGetter(object, prop) {
      while (object !== null) {
        const desc = getOwnPropertyDescriptor(object, prop);
        if (desc) {
          if (desc.get) {
            return unapply(desc.get);
          }
          if (typeof desc.value === "function") {
            return unapply(desc.value);
          }
        }
        object = getPrototypeOf(object);
      }
      function fallbackValue() {
        return null;
      }
      return fallbackValue;
    }
    const html$1 = freeze(["a", "abbr", "acronym", "address", "area", "article", "aside", "audio", "b", "bdi", "bdo", "big", "blink", "blockquote", "body", "br", "button", "canvas", "caption", "center", "cite", "code", "col", "colgroup", "content", "data", "datalist", "dd", "decorator", "del", "details", "dfn", "dialog", "dir", "div", "dl", "dt", "element", "em", "fieldset", "figcaption", "figure", "font", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "img", "input", "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "marquee", "menu", "menuitem", "meter", "nav", "nobr", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "section", "select", "shadow", "small", "source", "spacer", "span", "strike", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "tt", "u", "ul", "var", "video", "wbr"]);
    const svg$1 = freeze(["svg", "a", "altglyph", "altglyphdef", "altglyphitem", "animatecolor", "animatemotion", "animatetransform", "circle", "clippath", "defs", "desc", "ellipse", "filter", "font", "g", "glyph", "glyphref", "hkern", "image", "line", "lineargradient", "marker", "mask", "metadata", "mpath", "path", "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "style", "switch", "symbol", "text", "textpath", "title", "tref", "tspan", "view", "vkern"]);
    const svgFilters = freeze(["feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence"]);
    const svgDisallowed = freeze(["animate", "color-profile", "cursor", "discard", "font-face", "font-face-format", "font-face-name", "font-face-src", "font-face-uri", "foreignobject", "hatch", "hatchpath", "mesh", "meshgradient", "meshpatch", "meshrow", "missing-glyph", "script", "set", "solidcolor", "unknown", "use"]);
    const mathMl$1 = freeze(["math", "menclose", "merror", "mfenced", "mfrac", "mglyph", "mi", "mlabeledtr", "mmultiscripts", "mn", "mo", "mover", "mpadded", "mphantom", "mroot", "mrow", "ms", "mspace", "msqrt", "mstyle", "msub", "msup", "msubsup", "mtable", "mtd", "mtext", "mtr", "munder", "munderover", "mprescripts"]);
    const mathMlDisallowed = freeze(["maction", "maligngroup", "malignmark", "mlongdiv", "mscarries", "mscarry", "msgroup", "mstack", "msline", "msrow", "semantics", "annotation", "annotation-xml", "mprescripts", "none"]);
    const text = freeze(["#text"]);
    const html = freeze(["accept", "action", "align", "alt", "autocapitalize", "autocomplete", "autopictureinpicture", "autoplay", "background", "bgcolor", "border", "capture", "cellpadding", "cellspacing", "checked", "cite", "class", "clear", "color", "cols", "colspan", "controls", "controlslist", "coords", "crossorigin", "datetime", "decoding", "default", "dir", "disabled", "disablepictureinpicture", "disableremoteplayback", "download", "draggable", "enctype", "enterkeyhint", "face", "for", "headers", "height", "hidden", "high", "href", "hreflang", "id", "inputmode", "integrity", "ismap", "kind", "label", "lang", "list", "loading", "loop", "low", "max", "maxlength", "media", "method", "min", "minlength", "multiple", "muted", "name", "nonce", "noshade", "novalidate", "nowrap", "open", "optimum", "pattern", "placeholder", "playsinline", "popover", "popovertarget", "popovertargetaction", "poster", "preload", "pubdate", "radiogroup", "readonly", "rel", "required", "rev", "reversed", "role", "rows", "rowspan", "spellcheck", "scope", "selected", "shape", "size", "sizes", "span", "srclang", "start", "src", "srcset", "step", "style", "summary", "tabindex", "title", "translate", "type", "usemap", "valign", "value", "width", "wrap", "xmlns", "slot"]);
    const svg = freeze(["accent-height", "accumulate", "additive", "alignment-baseline", "amplitude", "ascent", "attributename", "attributetype", "azimuth", "basefrequency", "baseline-shift", "begin", "bias", "by", "class", "clip", "clippathunits", "clip-path", "clip-rule", "color", "color-interpolation", "color-interpolation-filters", "color-profile", "color-rendering", "cx", "cy", "d", "dx", "dy", "diffuseconstant", "direction", "display", "divisor", "dur", "edgemode", "elevation", "end", "exponent", "fill", "fill-opacity", "fill-rule", "filter", "filterunits", "flood-color", "flood-opacity", "font-family", "font-size", "font-size-adjust", "font-stretch", "font-style", "font-variant", "font-weight", "fx", "fy", "g1", "g2", "glyph-name", "glyphref", "gradientunits", "gradienttransform", "height", "href", "id", "image-rendering", "in", "in2", "intercept", "k", "k1", "k2", "k3", "k4", "kerning", "keypoints", "keysplines", "keytimes", "lang", "lengthadjust", "letter-spacing", "kernelmatrix", "kernelunitlength", "lighting-color", "local", "marker-end", "marker-mid", "marker-start", "markerheight", "markerunits", "markerwidth", "maskcontentunits", "maskunits", "max", "mask", "media", "method", "mode", "min", "name", "numoctaves", "offset", "operator", "opacity", "order", "orient", "orientation", "origin", "overflow", "paint-order", "path", "pathlength", "patterncontentunits", "patterntransform", "patternunits", "points", "preservealpha", "preserveaspectratio", "primitiveunits", "r", "rx", "ry", "radius", "refx", "refy", "repeatcount", "repeatdur", "restart", "result", "rotate", "scale", "seed", "shape-rendering", "slope", "specularconstant", "specularexponent", "spreadmethod", "startoffset", "stddeviation", "stitchtiles", "stop-color", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-opacity", "stroke", "stroke-width", "style", "surfacescale", "systemlanguage", "tabindex", "tablevalues", "targetx", "targety", "transform", "transform-origin", "text-anchor", "text-decoration", "text-rendering", "textlength", "type", "u1", "u2", "unicode", "values", "viewbox", "visibility", "version", "vert-adv-y", "vert-origin-x", "vert-origin-y", "width", "word-spacing", "wrap", "writing-mode", "xchannelselector", "ychannelselector", "x", "x1", "x2", "xmlns", "y", "y1", "y2", "z", "zoomandpan"]);
    const mathMl = freeze(["accent", "accentunder", "align", "bevelled", "close", "columnsalign", "columnlines", "columnspan", "denomalign", "depth", "dir", "display", "displaystyle", "encoding", "fence", "frame", "height", "href", "id", "largeop", "length", "linethickness", "lspace", "lquote", "mathbackground", "mathcolor", "mathsize", "mathvariant", "maxsize", "minsize", "movablelimits", "notation", "numalign", "open", "rowalign", "rowlines", "rowspacing", "rowspan", "rspace", "rquote", "scriptlevel", "scriptminsize", "scriptsizemultiplier", "selection", "separator", "separators", "stretchy", "subscriptshift", "supscriptshift", "symmetric", "voffset", "width", "xmlns"]);
    const xml = freeze(["xlink:href", "xml:id", "xlink:title", "xml:space", "xmlns:xlink"]);
    const MUSTACHE_EXPR = seal(/\{\{[\w\W]*|[\w\W]*\}\}/gm);
    const ERB_EXPR = seal(/<%[\w\W]*|[\w\W]*%>/gm);
    const TMPLIT_EXPR = seal(/\$\{[\w\W]*/gm);
    const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
    const ARIA_ATTR = seal(/^aria-[\-\w]+$/);
    const IS_ALLOWED_URI = seal(
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
      // eslint-disable-line no-useless-escape
    );
    const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
    const ATTR_WHITESPACE = seal(
      /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g
      // eslint-disable-line no-control-regex
    );
    const DOCTYPE_NAME = seal(/^html$/i);
    const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
    var EXPRESSIONS = /* @__PURE__ */ Object.freeze({
      __proto__: null,
      ARIA_ATTR,
      ATTR_WHITESPACE,
      CUSTOM_ELEMENT,
      DATA_ATTR,
      DOCTYPE_NAME,
      ERB_EXPR,
      IS_ALLOWED_URI,
      IS_SCRIPT_OR_DATA,
      MUSTACHE_EXPR,
      TMPLIT_EXPR
    });
    const NODE_TYPE = {
      element: 1,
      text: 3,
      // Deprecated
      progressingInstruction: 7,
      comment: 8,
      document: 9
    };
    const getGlobal = function getGlobal2() {
      return typeof window === "undefined" ? null : window;
    };
    const _createTrustedTypesPolicy = function _createTrustedTypesPolicy2(trustedTypes, purifyHostElement) {
      if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") {
        return null;
      }
      let suffix = null;
      const ATTR_NAME = "data-tt-policy-suffix";
      if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) {
        suffix = purifyHostElement.getAttribute(ATTR_NAME);
      }
      const policyName = "dompurify" + (suffix ? "#" + suffix : "");
      try {
        return trustedTypes.createPolicy(policyName, {
          createHTML(html2) {
            return html2;
          },
          createScriptURL(scriptUrl) {
            return scriptUrl;
          }
        });
      } catch (_) {
        console.warn("TrustedTypes policy " + policyName + " could not be created.");
        return null;
      }
    };
    const _createHooksMap = function _createHooksMap2() {
      return {
        afterSanitizeAttributes: [],
        afterSanitizeElements: [],
        afterSanitizeShadowDOM: [],
        beforeSanitizeAttributes: [],
        beforeSanitizeElements: [],
        beforeSanitizeShadowDOM: [],
        uponSanitizeAttribute: [],
        uponSanitizeElement: [],
        uponSanitizeShadowNode: []
      };
    };
    function createDOMPurify() {
      let window2 = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : getGlobal();
      const DOMPurify = (root) => createDOMPurify(root);
      DOMPurify.version = "3.2.6";
      DOMPurify.removed = [];
      if (!window2 || !window2.document || window2.document.nodeType !== NODE_TYPE.document || !window2.Element) {
        DOMPurify.isSupported = false;
        return DOMPurify;
      }
      let {
        document: document2
      } = window2;
      const originalDocument = document2;
      const currentScript = originalDocument.currentScript;
      const {
        DocumentFragment,
        HTMLTemplateElement,
        Node,
        Element,
        NodeFilter,
        NamedNodeMap = window2.NamedNodeMap || window2.MozNamedAttrMap,
        HTMLFormElement,
        DOMParser,
        trustedTypes
      } = window2;
      const ElementPrototype = Element.prototype;
      const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
      const remove = lookupGetter(ElementPrototype, "remove");
      const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
      const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
      const getParentNode = lookupGetter(ElementPrototype, "parentNode");
      if (typeof HTMLTemplateElement === "function") {
        const template = document2.createElement("template");
        if (template.content && template.content.ownerDocument) {
          document2 = template.content.ownerDocument;
        }
      }
      let trustedTypesPolicy;
      let emptyHTML = "";
      const {
        implementation,
        createNodeIterator,
        createDocumentFragment,
        getElementsByTagName
      } = document2;
      const {
        importNode
      } = originalDocument;
      let hooks = _createHooksMap();
      DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== void 0;
      const {
        MUSTACHE_EXPR: MUSTACHE_EXPR2,
        ERB_EXPR: ERB_EXPR2,
        TMPLIT_EXPR: TMPLIT_EXPR2,
        DATA_ATTR: DATA_ATTR2,
        ARIA_ATTR: ARIA_ATTR2,
        IS_SCRIPT_OR_DATA: IS_SCRIPT_OR_DATA2,
        ATTR_WHITESPACE: ATTR_WHITESPACE2,
        CUSTOM_ELEMENT: CUSTOM_ELEMENT2
      } = EXPRESSIONS;
      let {
        IS_ALLOWED_URI: IS_ALLOWED_URI$1
      } = EXPRESSIONS;
      let ALLOWED_TAGS = null;
      const DEFAULT_ALLOWED_TAGS = addToSet({}, [...html$1, ...svg$1, ...svgFilters, ...mathMl$1, ...text]);
      let ALLOWED_ATTR = null;
      const DEFAULT_ALLOWED_ATTR = addToSet({}, [...html, ...svg, ...mathMl, ...xml]);
      let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
        tagNameCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        },
        attributeNameCheck: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: null
        },
        allowCustomizedBuiltInElements: {
          writable: true,
          configurable: false,
          enumerable: true,
          value: false
        }
      }));
      let FORBID_TAGS = null;
      let FORBID_ATTR = null;
      let ALLOW_ARIA_ATTR = true;
      let ALLOW_DATA_ATTR = true;
      let ALLOW_UNKNOWN_PROTOCOLS = false;
      let ALLOW_SELF_CLOSE_IN_ATTR = true;
      let SAFE_FOR_TEMPLATES = false;
      let SAFE_FOR_XML = true;
      let WHOLE_DOCUMENT = false;
      let SET_CONFIG = false;
      let FORCE_BODY = false;
      let RETURN_DOM = false;
      let RETURN_DOM_FRAGMENT = false;
      let RETURN_TRUSTED_TYPE = false;
      let SANITIZE_DOM = true;
      let SANITIZE_NAMED_PROPS = false;
      const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
      let KEEP_CONTENT = true;
      let IN_PLACE = false;
      let USE_PROFILES = {};
      let FORBID_CONTENTS = null;
      const DEFAULT_FORBID_CONTENTS = addToSet({}, ["annotation-xml", "audio", "colgroup", "desc", "foreignobject", "head", "iframe", "math", "mi", "mn", "mo", "ms", "mtext", "noembed", "noframes", "noscript", "plaintext", "script", "style", "svg", "template", "thead", "title", "video", "xmp"]);
      let DATA_URI_TAGS = null;
      const DEFAULT_DATA_URI_TAGS = addToSet({}, ["audio", "video", "img", "source", "image", "track"]);
      let URI_SAFE_ATTRIBUTES = null;
      const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, ["alt", "class", "for", "id", "label", "name", "pattern", "placeholder", "role", "summary", "title", "value", "style", "xmlns"]);
      const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
      const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
      const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
      let NAMESPACE = HTML_NAMESPACE;
      let IS_EMPTY_INPUT = false;
      let ALLOWED_NAMESPACES = null;
      const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [MATHML_NAMESPACE, SVG_NAMESPACE, HTML_NAMESPACE], stringToString);
      let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, ["mi", "mo", "mn", "ms", "mtext"]);
      let HTML_INTEGRATION_POINTS = addToSet({}, ["annotation-xml"]);
      const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, ["title", "style", "font", "a", "script"]);
      let PARSER_MEDIA_TYPE = null;
      const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
      const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
      let transformCaseFunc = null;
      let CONFIG = null;
      const formElement = document2.createElement("form");
      const isRegexOrFunction = function isRegexOrFunction2(testValue) {
        return testValue instanceof RegExp || testValue instanceof Function;
      };
      const _parseConfig = function _parseConfig2() {
        let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        if (CONFIG && CONFIG === cfg) {
          return;
        }
        if (!cfg || typeof cfg !== "object") {
          cfg = {};
        }
        cfg = clone(cfg);
        PARSER_MEDIA_TYPE = // eslint-disable-next-line unicorn/prefer-includes
        SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
        transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
        ALLOWED_TAGS = objectHasOwnProperty(cfg, "ALLOWED_TAGS") ? addToSet({}, cfg.ALLOWED_TAGS, transformCaseFunc) : DEFAULT_ALLOWED_TAGS;
        ALLOWED_ATTR = objectHasOwnProperty(cfg, "ALLOWED_ATTR") ? addToSet({}, cfg.ALLOWED_ATTR, transformCaseFunc) : DEFAULT_ALLOWED_ATTR;
        ALLOWED_NAMESPACES = objectHasOwnProperty(cfg, "ALLOWED_NAMESPACES") ? addToSet({}, cfg.ALLOWED_NAMESPACES, stringToString) : DEFAULT_ALLOWED_NAMESPACES;
        URI_SAFE_ATTRIBUTES = objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") ? addToSet(clone(DEFAULT_URI_SAFE_ATTRIBUTES), cfg.ADD_URI_SAFE_ATTR, transformCaseFunc) : DEFAULT_URI_SAFE_ATTRIBUTES;
        DATA_URI_TAGS = objectHasOwnProperty(cfg, "ADD_DATA_URI_TAGS") ? addToSet(clone(DEFAULT_DATA_URI_TAGS), cfg.ADD_DATA_URI_TAGS, transformCaseFunc) : DEFAULT_DATA_URI_TAGS;
        FORBID_CONTENTS = objectHasOwnProperty(cfg, "FORBID_CONTENTS") ? addToSet({}, cfg.FORBID_CONTENTS, transformCaseFunc) : DEFAULT_FORBID_CONTENTS;
        FORBID_TAGS = objectHasOwnProperty(cfg, "FORBID_TAGS") ? addToSet({}, cfg.FORBID_TAGS, transformCaseFunc) : clone({});
        FORBID_ATTR = objectHasOwnProperty(cfg, "FORBID_ATTR") ? addToSet({}, cfg.FORBID_ATTR, transformCaseFunc) : clone({});
        USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES : false;
        ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
        ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
        ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
        ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
        SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
        SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
        WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
        RETURN_DOM = cfg.RETURN_DOM || false;
        RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
        RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
        FORCE_BODY = cfg.FORCE_BODY || false;
        SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
        SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
        KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
        IN_PLACE = cfg.IN_PLACE || false;
        IS_ALLOWED_URI$1 = cfg.ALLOWED_URI_REGEXP || IS_ALLOWED_URI;
        NAMESPACE = cfg.NAMESPACE || HTML_NAMESPACE;
        MATHML_TEXT_INTEGRATION_POINTS = cfg.MATHML_TEXT_INTEGRATION_POINTS || MATHML_TEXT_INTEGRATION_POINTS;
        HTML_INTEGRATION_POINTS = cfg.HTML_INTEGRATION_POINTS || HTML_INTEGRATION_POINTS;
        CUSTOM_ELEMENT_HANDLING = cfg.CUSTOM_ELEMENT_HANDLING || {};
        if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck)) {
          CUSTOM_ELEMENT_HANDLING.tagNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.tagNameCheck;
        }
        if (cfg.CUSTOM_ELEMENT_HANDLING && isRegexOrFunction(cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck)) {
          CUSTOM_ELEMENT_HANDLING.attributeNameCheck = cfg.CUSTOM_ELEMENT_HANDLING.attributeNameCheck;
        }
        if (cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements === "boolean") {
          CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = cfg.CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements;
        }
        if (SAFE_FOR_TEMPLATES) {
          ALLOW_DATA_ATTR = false;
        }
        if (RETURN_DOM_FRAGMENT) {
          RETURN_DOM = true;
        }
        if (USE_PROFILES) {
          ALLOWED_TAGS = addToSet({}, text);
          ALLOWED_ATTR = [];
          if (USE_PROFILES.html === true) {
            addToSet(ALLOWED_TAGS, html$1);
            addToSet(ALLOWED_ATTR, html);
          }
          if (USE_PROFILES.svg === true) {
            addToSet(ALLOWED_TAGS, svg$1);
            addToSet(ALLOWED_ATTR, svg);
            addToSet(ALLOWED_ATTR, xml);
          }
          if (USE_PROFILES.svgFilters === true) {
            addToSet(ALLOWED_TAGS, svgFilters);
            addToSet(ALLOWED_ATTR, svg);
            addToSet(ALLOWED_ATTR, xml);
          }
          if (USE_PROFILES.mathMl === true) {
            addToSet(ALLOWED_TAGS, mathMl$1);
            addToSet(ALLOWED_ATTR, mathMl);
            addToSet(ALLOWED_ATTR, xml);
          }
        }
        if (cfg.ADD_TAGS) {
          if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) {
            ALLOWED_TAGS = clone(ALLOWED_TAGS);
          }
          addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
        }
        if (cfg.ADD_ATTR) {
          if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) {
            ALLOWED_ATTR = clone(ALLOWED_ATTR);
          }
          addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
        }
        if (cfg.ADD_URI_SAFE_ATTR) {
          addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
        }
        if (cfg.FORBID_CONTENTS) {
          if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) {
            FORBID_CONTENTS = clone(FORBID_CONTENTS);
          }
          addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
        }
        if (KEEP_CONTENT) {
          ALLOWED_TAGS["#text"] = true;
        }
        if (WHOLE_DOCUMENT) {
          addToSet(ALLOWED_TAGS, ["html", "head", "body"]);
        }
        if (ALLOWED_TAGS.table) {
          addToSet(ALLOWED_TAGS, ["tbody"]);
          delete FORBID_TAGS.tbody;
        }
        if (cfg.TRUSTED_TYPES_POLICY) {
          if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") {
            throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createHTML" hook.');
          }
          if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") {
            throw typeErrorCreate('TRUSTED_TYPES_POLICY configuration option must provide a "createScriptURL" hook.');
          }
          trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
          emptyHTML = trustedTypesPolicy.createHTML("");
        } else {
          if (trustedTypesPolicy === void 0) {
            trustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
          }
          if (trustedTypesPolicy !== null && typeof emptyHTML === "string") {
            emptyHTML = trustedTypesPolicy.createHTML("");
          }
        }
        if (freeze) {
          freeze(cfg);
        }
        CONFIG = cfg;
      };
      const ALL_SVG_TAGS = addToSet({}, [...svg$1, ...svgFilters, ...svgDisallowed]);
      const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
      const _checkValidNamespace = function _checkValidNamespace2(element) {
        let parent = getParentNode(element);
        if (!parent || !parent.tagName) {
          parent = {
            namespaceURI: NAMESPACE,
            tagName: "template"
          };
        }
        const tagName = stringToLowerCase(element.tagName);
        const parentTagName = stringToLowerCase(parent.tagName);
        if (!ALLOWED_NAMESPACES[element.namespaceURI]) {
          return false;
        }
        if (element.namespaceURI === SVG_NAMESPACE) {
          if (parent.namespaceURI === HTML_NAMESPACE) {
            return tagName === "svg";
          }
          if (parent.namespaceURI === MATHML_NAMESPACE) {
            return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
          }
          return Boolean(ALL_SVG_TAGS[tagName]);
        }
        if (element.namespaceURI === MATHML_NAMESPACE) {
          if (parent.namespaceURI === HTML_NAMESPACE) {
            return tagName === "math";
          }
          if (parent.namespaceURI === SVG_NAMESPACE) {
            return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
          }
          return Boolean(ALL_MATHML_TAGS[tagName]);
        }
        if (element.namespaceURI === HTML_NAMESPACE) {
          if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) {
            return false;
          }
          if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) {
            return false;
          }
          return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
        }
        if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) {
          return true;
        }
        return false;
      };
      const _forceRemove = function _forceRemove2(node) {
        arrayPush(DOMPurify.removed, {
          element: node
        });
        try {
          getParentNode(node).removeChild(node);
        } catch (_) {
          remove(node);
        }
      };
      const _removeAttribute = function _removeAttribute2(name, element) {
        try {
          arrayPush(DOMPurify.removed, {
            attribute: element.getAttributeNode(name),
            from: element
          });
        } catch (_) {
          arrayPush(DOMPurify.removed, {
            attribute: null,
            from: element
          });
        }
        element.removeAttribute(name);
        if (name === "is") {
          if (RETURN_DOM || RETURN_DOM_FRAGMENT) {
            try {
              _forceRemove(element);
            } catch (_) {
            }
          } else {
            try {
              element.setAttribute(name, "");
            } catch (_) {
            }
          }
        }
      };
      const _initDocument = function _initDocument2(dirty) {
        let doc = null;
        let leadingWhitespace = null;
        if (FORCE_BODY) {
          dirty = "<remove></remove>" + dirty;
        } else {
          const matches = stringMatch(dirty, /^[\r\n\t ]+/);
          leadingWhitespace = matches && matches[0];
        }
        if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) {
          dirty = '<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>' + dirty + "</body></html>";
        }
        const dirtyPayload = trustedTypesPolicy ? trustedTypesPolicy.createHTML(dirty) : dirty;
        if (NAMESPACE === HTML_NAMESPACE) {
          try {
            doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
          } catch (_) {
          }
        }
        if (!doc || !doc.documentElement) {
          doc = implementation.createDocument(NAMESPACE, "template", null);
          try {
            doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
          } catch (_) {
          }
        }
        const body = doc.body || doc.documentElement;
        if (dirty && leadingWhitespace) {
          body.insertBefore(document2.createTextNode(leadingWhitespace), body.childNodes[0] || null);
        }
        if (NAMESPACE === HTML_NAMESPACE) {
          return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
        }
        return WHOLE_DOCUMENT ? doc.documentElement : body;
      };
      const _createNodeIterator = function _createNodeIterator2(root) {
        return createNodeIterator.call(
          root.ownerDocument || root,
          root,
          // eslint-disable-next-line no-bitwise
          NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION,
          null
        );
      };
      const _isClobbered = function _isClobbered2(element) {
        return element instanceof HTMLFormElement && (typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || !(element.attributes instanceof NamedNodeMap) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function");
      };
      const _isNode = function _isNode2(value) {
        return typeof Node === "function" && value instanceof Node;
      };
      function _executeHooks(hooks2, currentNode, data) {
        arrayForEach(hooks2, (hook) => {
          hook.call(DOMPurify, currentNode, data, CONFIG);
        });
      }
      const _sanitizeElements = function _sanitizeElements2(currentNode) {
        let content = null;
        _executeHooks(hooks.beforeSanitizeElements, currentNode, null);
        if (_isClobbered(currentNode)) {
          _forceRemove(currentNode);
          return true;
        }
        const tagName = transformCaseFunc(currentNode.nodeName);
        _executeHooks(hooks.uponSanitizeElement, currentNode, {
          tagName,
          allowedTags: ALLOWED_TAGS
        });
        if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(/<[/\w!]/g, currentNode.innerHTML) && regExpTest(/<[/\w!]/g, currentNode.textContent)) {
          _forceRemove(currentNode);
          return true;
        }
        if (currentNode.nodeType === NODE_TYPE.progressingInstruction) {
          _forceRemove(currentNode);
          return true;
        }
        if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(/<[/\w]/g, currentNode.data)) {
          _forceRemove(currentNode);
          return true;
        }
        if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
          if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
            if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) {
              return false;
            }
            if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) {
              return false;
            }
          }
          if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
            const parentNode = getParentNode(currentNode) || currentNode.parentNode;
            const childNodes = getChildNodes(currentNode) || currentNode.childNodes;
            if (childNodes && parentNode) {
              const childCount = childNodes.length;
              for (let i = childCount - 1; i >= 0; --i) {
                const childClone = cloneNode(childNodes[i], true);
                childClone.__removalCount = (currentNode.__removalCount || 0) + 1;
                parentNode.insertBefore(childClone, getNextSibling(currentNode));
              }
            }
          }
          _forceRemove(currentNode);
          return true;
        }
        if (currentNode instanceof Element && !_checkValidNamespace(currentNode)) {
          _forceRemove(currentNode);
          return true;
        }
        if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(/<\/no(script|embed|frames)/i, currentNode.innerHTML)) {
          _forceRemove(currentNode);
          return true;
        }
        if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
          content = currentNode.textContent;
          arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
            content = stringReplace(content, expr, " ");
          });
          if (currentNode.textContent !== content) {
            arrayPush(DOMPurify.removed, {
              element: currentNode.cloneNode()
            });
            currentNode.textContent = content;
          }
        }
        _executeHooks(hooks.afterSanitizeElements, currentNode, null);
        return false;
      };
      const _isValidAttribute = function _isValidAttribute2(lcTag, lcName, value) {
        if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document2 || value in formElement)) {
          return false;
        }
        if (ALLOW_DATA_ATTR && !FORBID_ATTR[lcName] && regExpTest(DATA_ATTR2, lcName)) ;
        else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR2, lcName)) ;
        else if (!ALLOWED_ATTR[lcName] || FORBID_ATTR[lcName]) {
          if (
            // First condition does a very basic check if a) it's basically a valid custom element tagname AND
            // b) if the tagName passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
            // and c) if the attribute name passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.attributeNameCheck
            _isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName)) || // Alternative, second condition checks if it's an `is`-attribute, AND
            // the value passes whatever the user has configured for CUSTOM_ELEMENT_HANDLING.tagNameCheck
            lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value))
          ) ;
          else {
            return false;
          }
        } else if (URI_SAFE_ATTRIBUTES[lcName]) ;
        else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE2, ""))) ;
        else if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]) ;
        else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA2, stringReplace(value, ATTR_WHITESPACE2, ""))) ;
        else if (value) {
          return false;
        } else ;
        return true;
      };
      const _isBasicCustomElement = function _isBasicCustomElement2(tagName) {
        return tagName !== "annotation-xml" && stringMatch(tagName, CUSTOM_ELEMENT2);
      };
      const _sanitizeAttributes = function _sanitizeAttributes2(currentNode) {
        _executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
        const {
          attributes
        } = currentNode;
        if (!attributes || _isClobbered(currentNode)) {
          return;
        }
        const hookEvent = {
          attrName: "",
          attrValue: "",
          keepAttr: true,
          allowedAttributes: ALLOWED_ATTR,
          forceKeepAttr: void 0
        };
        let l = attributes.length;
        while (l--) {
          const attr = attributes[l];
          const {
            name,
            namespaceURI,
            value: attrValue
          } = attr;
          const lcName = transformCaseFunc(name);
          const initValue = attrValue;
          let value = name === "value" ? initValue : stringTrim(initValue);
          hookEvent.attrName = lcName;
          hookEvent.attrValue = value;
          hookEvent.keepAttr = true;
          hookEvent.forceKeepAttr = void 0;
          _executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
          value = hookEvent.attrValue;
          if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name")) {
            _removeAttribute(name, currentNode);
            value = SANITIZE_NAMED_PROPS_PREFIX + value;
          }
          if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|title)/i, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          if (hookEvent.forceKeepAttr) {
            continue;
          }
          if (!hookEvent.keepAttr) {
            _removeAttribute(name, currentNode);
            continue;
          }
          if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(/\/>/i, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          if (SAFE_FOR_TEMPLATES) {
            arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
              value = stringReplace(value, expr, " ");
            });
          }
          const lcTag = transformCaseFunc(currentNode.nodeName);
          if (!_isValidAttribute(lcTag, lcName, value)) {
            _removeAttribute(name, currentNode);
            continue;
          }
          if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function") {
            if (namespaceURI) ;
            else {
              switch (trustedTypes.getAttributeType(lcTag, lcName)) {
                case "TrustedHTML": {
                  value = trustedTypesPolicy.createHTML(value);
                  break;
                }
                case "TrustedScriptURL": {
                  value = trustedTypesPolicy.createScriptURL(value);
                  break;
                }
              }
            }
          }
          if (value !== initValue) {
            try {
              if (namespaceURI) {
                currentNode.setAttributeNS(namespaceURI, name, value);
              } else {
                currentNode.setAttribute(name, value);
              }
              if (_isClobbered(currentNode)) {
                _forceRemove(currentNode);
              } else {
                arrayPop(DOMPurify.removed);
              }
            } catch (_) {
              _removeAttribute(name, currentNode);
            }
          }
        }
        _executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
      };
      const _sanitizeShadowDOM = function _sanitizeShadowDOM2(fragment) {
        let shadowNode = null;
        const shadowIterator = _createNodeIterator(fragment);
        _executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
        while (shadowNode = shadowIterator.nextNode()) {
          _executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
          _sanitizeElements(shadowNode);
          _sanitizeAttributes(shadowNode);
          if (shadowNode.content instanceof DocumentFragment) {
            _sanitizeShadowDOM2(shadowNode.content);
          }
        }
        _executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
      };
      DOMPurify.sanitize = function(dirty) {
        let cfg = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {};
        let body = null;
        let importedNode = null;
        let currentNode = null;
        let returnNode = null;
        IS_EMPTY_INPUT = !dirty;
        if (IS_EMPTY_INPUT) {
          dirty = "<!-->";
        }
        if (typeof dirty !== "string" && !_isNode(dirty)) {
          if (typeof dirty.toString === "function") {
            dirty = dirty.toString();
            if (typeof dirty !== "string") {
              throw typeErrorCreate("dirty is not a string, aborting");
            }
          } else {
            throw typeErrorCreate("toString is not a function");
          }
        }
        if (!DOMPurify.isSupported) {
          return dirty;
        }
        if (!SET_CONFIG) {
          _parseConfig(cfg);
        }
        DOMPurify.removed = [];
        if (typeof dirty === "string") {
          IN_PLACE = false;
        }
        if (IN_PLACE) {
          if (dirty.nodeName) {
            const tagName = transformCaseFunc(dirty.nodeName);
            if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
              throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
            }
          }
        } else if (dirty instanceof Node) {
          body = _initDocument("<!---->");
          importedNode = body.ownerDocument.importNode(dirty, true);
          if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") {
            body = importedNode;
          } else if (importedNode.nodeName === "HTML") {
            body = importedNode;
          } else {
            body.appendChild(importedNode);
          }
        } else {
          if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && // eslint-disable-next-line unicorn/prefer-includes
          dirty.indexOf("<") === -1) {
            return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(dirty) : dirty;
          }
          body = _initDocument(dirty);
          if (!body) {
            return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
          }
        }
        if (body && FORCE_BODY) {
          _forceRemove(body.firstChild);
        }
        const nodeIterator = _createNodeIterator(IN_PLACE ? dirty : body);
        while (currentNode = nodeIterator.nextNode()) {
          _sanitizeElements(currentNode);
          _sanitizeAttributes(currentNode);
          if (currentNode.content instanceof DocumentFragment) {
            _sanitizeShadowDOM(currentNode.content);
          }
        }
        if (IN_PLACE) {
          return dirty;
        }
        if (RETURN_DOM) {
          if (RETURN_DOM_FRAGMENT) {
            returnNode = createDocumentFragment.call(body.ownerDocument);
            while (body.firstChild) {
              returnNode.appendChild(body.firstChild);
            }
          } else {
            returnNode = body;
          }
          if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) {
            returnNode = importNode.call(originalDocument, returnNode, true);
          }
          return returnNode;
        }
        let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
        if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) {
          serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
        }
        if (SAFE_FOR_TEMPLATES) {
          arrayForEach([MUSTACHE_EXPR2, ERB_EXPR2, TMPLIT_EXPR2], (expr) => {
            serializedHTML = stringReplace(serializedHTML, expr, " ");
          });
        }
        return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? trustedTypesPolicy.createHTML(serializedHTML) : serializedHTML;
      };
      DOMPurify.setConfig = function() {
        let cfg = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : {};
        _parseConfig(cfg);
        SET_CONFIG = true;
      };
      DOMPurify.clearConfig = function() {
        CONFIG = null;
        SET_CONFIG = false;
      };
      DOMPurify.isValidAttribute = function(tag2, attr, value) {
        if (!CONFIG) {
          _parseConfig({});
        }
        const lcTag = transformCaseFunc(tag2);
        const lcName = transformCaseFunc(attr);
        return _isValidAttribute(lcTag, lcName, value);
      };
      DOMPurify.addHook = function(entryPoint, hookFunction) {
        if (typeof hookFunction !== "function") {
          return;
        }
        arrayPush(hooks[entryPoint], hookFunction);
      };
      DOMPurify.removeHook = function(entryPoint, hookFunction) {
        if (hookFunction !== void 0) {
          const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
          return index === -1 ? void 0 : arraySplice(hooks[entryPoint], index, 1)[0];
        }
        return arrayPop(hooks[entryPoint]);
      };
      DOMPurify.removeHooks = function(entryPoint) {
        hooks[entryPoint] = [];
      };
      DOMPurify.removeAllHooks = function() {
        hooks = _createHooksMap();
      };
      return DOMPurify;
    }
    var purify = createDOMPurify();
    function FilePreview({ file, uploadState = "complete", onCancel }) {
      var _a, _b, _c2;
      const isImage = (_a = file == null ? void 0 : file.type) == null ? void 0 : _a.startsWith("image/");
      const getFileTypeLabel = (mimeType) => {
        if (!mimeType) return "FILE";
        if (mimeType.startsWith("image/")) return "IMG";
        if (mimeType.startsWith("video/")) return "VID";
        if (mimeType.startsWith("audio/")) return "AUD";
        if (mimeType.includes("pdf")) return "PDF";
        if (mimeType.includes("word") || mimeType.includes("document")) return "DOC";
        if (mimeType.includes("sheet") || mimeType.includes("excel")) return "XLS";
        if (mimeType.includes("text")) return "TXT";
        if (mimeType.includes("zip") || mimeType.includes("rar")) return "ZIP";
        return "FILE";
      };
      const getStatusText = () => {
        switch (uploadState) {
          case "uploading":
            return (file == null ? void 0 : file.progress) ? `Uploading... ${file.progress}%` : "Uploading...";
          case "error":
            return "Upload failed";
          case "complete":
            return (file == null ? void 0 : file.size) ? formatFileSize(file.size) : "Ready";
          default:
            return "Ready";
        }
      };
      const formatFileSize = (bytes) => {
        if (!bytes) return "";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
        return Math.round(bytes / (1024 * 1024)) + " MB";
      };
      const getFileCardClass = () => {
        switch (uploadState) {
          case "uploading":
            return "file-card file-card-uploading";
          case "error":
            return "file-card file-card-error";
          case "complete":
          default:
            return "file-card file-card-complete";
        }
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "file-preview-container", children: isImage && uploadState === "complete" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "image-preview", children: file.url ? /* @__PURE__ */ jsxRuntimeExports.jsx(
        "img",
        {
          src: file.url,
          alt: file.name
        }
      ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "file-preview-placeholder", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Image$1, { size: 24, className: "file-preview-placeholder-icon" }),
        file.name
      ] }) }) : ((_b = file.type) == null ? void 0 : _b.startsWith("video/")) && uploadState === "complete" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "video-preview", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "video",
        {
          src: file.url,
          controls: true
        }
      ) }) : ((_c2 = file.type) == null ? void 0 : _c2.includes("pdf")) && uploadState === "complete" ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pdf-preview", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
        "iframe",
        {
          src: file.url,
          title: file.name,
          onError: (e) => {
            e.target.outerHTML = `<div class="pdf-error-message">Unable to preview PDF. Please download the file instead.</div>`;
          }
        }
      ) }) : (
        /* File Card */
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: getFileCardClass(), children: [
          uploadState === "uploading" && onCancel && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: onCancel,
              className: "file-cancel-button",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 12 })
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `file-icon ${uploadState === "error" ? "file-icon-error" : ""}`, children: uploadState === "error" ? "✗" : getFileTypeLabel(file.type) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "file-info", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `file-name ${uploadState === "error" ? "file-name-error" : ""}`, children: file.name }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `file-status ${uploadState === "error" ? "file-status-error" : ""}`, children: getStatusText() }),
            uploadState === "uploading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "file-progress-bar", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: "file-progress-fill",
                style: { "--progress-width": file.progress ? `${file.progress}%` : "10%" }
              }
            ) })
          ] })
        ] })
      ) });
    }
    const getAvatarUrl$1 = (config) => {
      var _a, _b;
      const { tenant_id, branding, _cloudfront } = config || {};
      const avatarSources = [
        branding == null ? void 0 : branding.avatar_url,
        branding == null ? void 0 : branding.logo_url,
        branding == null ? void 0 : branding.bot_avatar_url,
        branding == null ? void 0 : branding.icon,
        (_a = branding == null ? void 0 : branding.custom_icons) == null ? void 0 : _a.bot_avatar,
        (_b = _cloudfront == null ? void 0 : _cloudfront.urls) == null ? void 0 : _b.avatar,
        `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
        `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/FVC_logo.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/avatar.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/logo.png`,
        "https://chat.myrecruiter.ai/collateral/default-avatar.png"
      ];
      return avatarSources.find((url) => url && url.trim()) || "https://chat.myrecruiter.ai/collateral/default-avatar.png";
    };
    function MessageBubble({ role, content, files = [], actions = [], uploadState, onCancel }) {
      var _a, _b, _c2;
      const { config } = useConfig();
      const { addMessage, isTyping } = useChat();
      const [avatarError, setAvatarError] = reactExports.useState(false);
      const isUser = role === "user";
      const html2 = content ? purify.sanitize(marked.parse(content)) : "";
      const avatarSrc = getAvatarUrl$1(config);
      const handleActionClick = (action) => {
        if (isTyping) return;
        const messageText = action.value || action.label;
        addMessage({ role: "user", content: messageText });
      };
      const handleAvatarError = () => {
        console.log("❌ Avatar failed to load:", avatarSrc);
        setAvatarError(true);
      };
      const handleAvatarLoad = () => {
        console.log("✅ Avatar loaded successfully:", avatarSrc);
        setAvatarError(false);
      };
      const getActionChipsLayoutClass = (actions2) => {
        var _a2;
        if (!actions2 || actions2.length === 0) return "";
        const maxShortTextLength = ((_a2 = config == null ? void 0 : config.action_chips) == null ? void 0 : _a2.short_text_threshold) || 16;
        const hasLongText = actions2.some(
          (action) => (action.label || "").length > maxShortTextLength
        );
        return hasLongText ? "long-text" : "";
      };
      return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `message ${isUser ? "user" : "bot"}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "message-content", children: [
        !isUser && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "message-header", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "message-avatar", children: !avatarError && /* @__PURE__ */ jsxRuntimeExports.jsx(
            "img",
            {
              src: avatarSrc,
              onError: handleAvatarError,
              onLoad: handleAvatarLoad,
              alt: "Avatar",
              crossOrigin: "anonymous"
            }
          ) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "message-sender-name", children: ((_a = config == null ? void 0 : config.branding) == null ? void 0 : _a.bot_name) || ((_b = config == null ? void 0 : config.branding) == null ? void 0 : _b.chat_title) || "Assistant" })
        ] }),
        content && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "message-text", dangerouslySetInnerHTML: { __html: html2 } }),
        (role === "assistant" || role === "bot") && actions && actions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `action-chips ${getActionChipsLayoutClass(actions)}`, children: actions.slice(0, ((_c2 = config == null ? void 0 : config.action_chips) == null ? void 0 : _c2.max_display) || 5).map((action, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => handleActionClick(action),
            disabled: isTyping,
            className: "action-chip",
            children: action.label
          },
          index
        )) }),
        files && files.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "file-attachments", children: files.map((file, index) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          FilePreview,
          {
            file,
            uploadState,
            onCancel
          },
          index
        )) })
      ] }) });
    }
    const getAvatarUrl = (config) => {
      var _a, _b;
      const { tenant_id, branding, _cloudfront } = config || {};
      const avatarSources = [
        branding == null ? void 0 : branding.avatar_url,
        branding == null ? void 0 : branding.logo_url,
        branding == null ? void 0 : branding.bot_avatar_url,
        branding == null ? void 0 : branding.icon,
        (_a = branding == null ? void 0 : branding.custom_icons) == null ? void 0 : _a.bot_avatar,
        (_b = _cloudfront == null ? void 0 : _cloudfront.urls) == null ? void 0 : _b.avatar,
        `https://chat.myrecruiter.ai/tenants/${tenant_id}/avatar.png`,
        `https://chat.myrecruiter.ai/tenants/${tenant_id}/logo.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/FVC_logo.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/avatar.png`,
        `https://myrecruiter-picasso.s3.us-east-1.amazonaws.com/tenants/${tenant_id}/logo.png`,
        "https://chat.myrecruiter.ai/collateral/default-avatar.png"
      ];
      return avatarSources.find((url) => url && url.trim()) || "https://chat.myrecruiter.ai/collateral/default-avatar.png";
    };
    function TypingIndicator() {
      const { config } = useConfig();
      const [avatarError, setAvatarError] = reactExports.useState(false);
      const avatarSrc = getAvatarUrl(config);
      const handleAvatarError = () => {
        console.log("❌ Typing avatar failed to load:", avatarSrc);
        setAvatarError(true);
      };
      const handleAvatarLoad = () => {
        console.log("✅ Typing avatar loaded successfully:", avatarSrc);
        setAvatarError(false);
      };
      const avatarUrl = avatarError ? "url(https://chat.myrecruiter.ai/collateral/default-avatar.png)" : `url(${avatarSrc})`;
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "typing-indicator-wrapper", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "div",
          {
            className: "bot-avatar",
            style: { "--dynamic-avatar-url": avatarUrl },
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "img",
              {
                src: avatarSrc,
                onError: handleAvatarError,
                onLoad: handleAvatarLoad,
                className: "hidden-img",
                alt: "Avatar"
              }
            )
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "typing-indicator-content", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typing-dot" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typing-dot" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "typing-dot" })
        ] })
      ] });
    }
    function ChatWidget() {
      var _a, _b, _c2, _d, _e, _f, _g, _h;
      const { messages, isTyping } = useChat();
      const { config } = useConfig();
      console.log("🔍 ChatWidget config:", config);
      console.log("🔍 ChatWidget config type:", typeof config);
      console.log("🔍 ChatWidget config keys:", config ? Object.keys(config) : "no config");
      console.log("🎨 ChatWidget component rendering...");
      console.log("🎨 ChatWidget messages:", (messages == null ? void 0 : messages.length) || 0);
      console.log("🎨 ChatWidget isTyping:", isTyping);
      useCSSVariables(config);
      const [isOpen, setIsOpen] = reactExports.useState(() => {
        const widgetConfig = (config == null ? void 0 : config.widget_behavior) || {};
        if (!widgetConfig.remember_state) {
          return widgetConfig.start_open || false;
        }
        try {
          const savedState = localStorage.getItem("picasso_chat_state");
          if (savedState !== null) {
            return JSON.parse(savedState);
          }
        } catch (error) {
          console.warn("Failed to parse saved chat state:", error);
        }
        return widgetConfig.start_open || false;
      });
      const [input, setInput] = reactExports.useState("");
      const [unreadCount, setUnreadCount] = reactExports.useState(0);
      const [showCallout, setShowCallout] = reactExports.useState(false);
      const [calloutDismissed, setCalloutDismissed] = reactExports.useState(false);
      const [showAttachmentMenu, setShowAttachmentMenu] = reactExports.useState(false);
      const [lastReadMessageIndex, setLastReadMessageIndex] = reactExports.useState(0);
      const [hasOpenedChat, setHasOpenedChat] = reactExports.useState(false);
      const calloutAutoDismissedRef = reactExports.useRef(false);
      const notifyParentEvent2 = (event, payload = {}) => {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({
            type: "PICASSO_EVENT",
            event,
            payload
          }, "*");
        }
      };
      const handleToggle = () => {
        var _a2;
        const newOpen = !isOpen;
        setIsOpen(newOpen);
        notifyParentEvent2(newOpen ? "CHAT_OPENED" : "CHAT_CLOSED");
        if ((_a2 = config == null ? void 0 : config.widget_behavior) == null ? void 0 : _a2.remember_state) {
          try {
            localStorage.setItem("picasso_chat_state", JSON.stringify(newOpen));
          } catch (e) {
            console.warn("Failed to save chat state on toggle:", e);
          }
        }
      };
      reactExports.useEffect(() => {
        const widgetConfig = (config == null ? void 0 : config.widget_behavior) || {};
        if (!isOpen && widgetConfig.auto_open_delay > 0) {
          let skipAutoOpen = false;
          if (widgetConfig.remember_state) {
            try {
              const saved = localStorage.getItem("picasso_chat_state");
              if (saved !== null) {
                skipAutoOpen = JSON.parse(saved) === false;
              }
            } catch (e) {
              console.warn("Failed to read saved chat state for auto-open check", e);
            }
          }
          if (!skipAutoOpen) {
            const timer = setTimeout(() => {
              setIsOpen(true);
            }, widgetConfig.auto_open_delay * 1e3);
            return () => clearTimeout(timer);
          }
        }
      }, [config == null ? void 0 : config.widget_behavior, isOpen, config == null ? void 0 : config.tenant_id]);
      reactExports.useEffect(() => {
        if (isOpen) {
          document.body.classList.add("chat-open");
        } else {
          document.body.classList.remove("chat-open");
        }
      }, [isOpen]);
      reactExports.useEffect(() => {
        var _a2;
        if (!((_a2 = config == null ? void 0 : config.features) == null ? void 0 : _a2.photo_uploads) && showAttachmentMenu) {
          setShowAttachmentMenu(false);
        }
      }, [(_a = config == null ? void 0 : config.features) == null ? void 0 : _a.photo_uploads, showAttachmentMenu]);
      const chatWindowRef = reactExports.useRef(null);
      const lastMessageRef = reactExports.useRef(null);
      const chat_title = (config == null ? void 0 : config.chat_title) || ((_b = config == null ? void 0 : config.branding) == null ? void 0 : _b.chat_title) || "Chat";
      const scrollToLatestMessage = () => {
        if (lastMessageRef.current) {
          const chatWindow = chatWindowRef.current;
          if (chatWindow) {
            chatWindow.style.scrollBehavior = "auto";
            const targetElement = lastMessageRef.current;
            const targetPosition = targetElement.offsetTop - chatWindow.offsetTop;
            const startPosition = chatWindow.scrollTop;
            const distance = targetPosition - startPosition;
            const duration = 800;
            let start = null;
            const animateScroll = (timestamp) => {
              if (!start) start = timestamp;
              const progress = timestamp - start;
              const percentage = Math.min(progress / duration, 1);
              const easeOut = 1 - Math.pow(1 - percentage, 3);
              chatWindow.scrollTop = startPosition + distance * easeOut;
              if (progress < duration) {
                requestAnimationFrame(animateScroll);
              } else {
                chatWindow.style.scrollBehavior = "smooth";
              }
            };
            requestAnimationFrame(animateScroll);
          }
        }
      };
      reactExports.useEffect(() => {
        if (isOpen) {
          setUnreadCount(0);
          setLastReadMessageIndex(messages.length);
          setHasOpenedChat(true);
        } else {
          const newBotMessages = messages.slice(lastReadMessageIndex).filter(
            (msg) => msg.role === "assistant" || msg.role === "bot"
          );
          if (newBotMessages.length > 0) {
            setUnreadCount(newBotMessages.length);
          }
        }
      }, [isOpen, messages.length]);
      reactExports.useEffect(() => {
        if (!isOpen && messages.length > lastReadMessageIndex) {
          const newMessages = messages.slice(lastReadMessageIndex);
          const newBotMessages = newMessages.filter(
            (msg) => msg.role === "assistant" || msg.role === "bot"
          );
          if (newBotMessages.length > 0) {
            setUnreadCount(newBotMessages.length);
          }
        }
      }, [messages, isOpen, lastReadMessageIndex]);
      reactExports.useEffect(() => {
        if ((messages == null ? void 0 : messages.length) > 0) {
          setTimeout(scrollToLatestMessage, 100);
        }
      }, [messages]);
      reactExports.useEffect(() => {
        if (isTyping) {
          setTimeout(scrollToLatestMessage, 100);
        }
      }, [isTyping]);
      reactExports.useEffect(() => {
        if (isOpen) {
          setTimeout(scrollToLatestMessage, 200);
        }
      }, [isOpen]);
      const calloutConfig = ((_c2 = config == null ? void 0 : config.features) == null ? void 0 : _c2.callout) || {};
      const calloutEnabled = typeof calloutConfig === "object" ? calloutConfig.enabled !== false : ((_d = config == null ? void 0 : config.features) == null ? void 0 : _d.callout) !== false;
      const calloutText = calloutConfig.text || (config == null ? void 0 : config.calloutText) || (config == null ? void 0 : config.callout_text) || // Legacy support
      "Hi! 👋 Need help? I'm here to assist you.";
      const calloutDelay = calloutConfig.delay || 1e3;
      const calloutAutoDismiss = calloutConfig.auto_dismiss || false;
      const calloutDismissTimeout = calloutConfig.dismiss_timeout || 3e4;
      reactExports.useEffect(() => {
        if (!isOpen && calloutEnabled && !calloutDismissed && !hasOpenedChat) {
          const timer = setTimeout(() => {
            setShowCallout(true);
          }, calloutDelay);
          return () => clearTimeout(timer);
        } else {
          setShowCallout(false);
        }
      }, [isOpen, calloutEnabled, calloutDismissed, hasOpenedChat, calloutDelay]);
      reactExports.useEffect(() => {
        if (showCallout && calloutAutoDismiss && calloutDismissTimeout > 0 && !calloutAutoDismissedRef.current) {
          const dismissTimer = setTimeout(() => {
            console.log("🕐 Callout auto-dismissing after timeout");
            setShowCallout(false);
            calloutAutoDismissedRef.current = true;
          }, calloutDismissTimeout);
          return () => clearTimeout(dismissTimer);
        }
      }, [showCallout, calloutAutoDismiss, calloutDismissTimeout]);
      const handleCalloutClose = () => {
        console.log("❌ Callout manually closed by user");
        setShowCallout(false);
        setCalloutDismissed(true);
      };
      reactExports.useEffect(() => {
        if (isOpen && hasOpenedChat) {
          calloutAutoDismissedRef.current = false;
          setCalloutDismissed(true);
        }
      }, [isOpen, hasOpenedChat]);
      console.log("ChatWidget render - state:", {
        isOpen,
        calloutEnabled,
        calloutDismissed,
        hasOpenedChat,
        showCallout,
        calloutText,
        // 🔧 Added for debugging FOS override
        calloutAutoDismissed: calloutAutoDismissedRef.current,
        unreadCount,
        lastReadMessageIndex,
        totalMessages: messages.length,
        tenant_id: config == null ? void 0 : config.tenant_id,
        chat_title,
        css_variables_applied: !!config,
        widget_behavior: config == null ? void 0 : config.widget_behavior,
        // 🔧 Added callout config debugging
        calloutConfig: {
          fullConfig: calloutConfig,
          textFromConfig: calloutConfig.text,
          textFromRoot: config == null ? void 0 : config.calloutText,
          textFromLegacy: config == null ? void 0 : config.callout_text
        },
        // Debug iframe and responsive behavior
        windowWidth: window.innerWidth,
        isIframe: document.body.getAttribute("data-iframe"),
        shouldShowToggle: window.innerWidth >= 768 || !isOpen,
        shouldShowChat: isOpen
      });
      const isDoubleInput = ((_e = config == null ? void 0 : config.features) == null ? void 0 : _e.uploads) || ((_f = config == null ? void 0 : config.features) == null ? void 0 : _f.voice);
      if (!config) {
        return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "#666",
          fontFamily: "system-ui"
        }, children: "Loading..." });
      }
      return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        (window.innerWidth >= 768 || !isOpen) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-toggle-wrapper", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "button",
            {
              onClick: () => {
                console.log(`🔄 Widget toggle clicked: ${isOpen ? "closing" : "opening"}`);
                handleToggle();
              },
              className: "chat-toggle-button",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(MessagesSquare, { size: 24 })
            }
          ),
          !isOpen && unreadCount > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "chat-notification-badge", children: unreadCount }),
          showCallout && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `chat-callout ${showCallout ? "visible" : ""}`, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-callout-header", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "chat-callout-text", dangerouslySetInnerHTML: { __html: calloutText } }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleCalloutClose, className: "chat-callout-close", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { size: 14 }) })
          ] }) })
        ] }),
        isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-container", "data-input-mode": isDoubleInput ? "double" : "single", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ChatHeader, { onClose: () => {
            var _a2;
            setIsOpen(false);
            if ((_a2 = config == null ? void 0 : config.widget_behavior) == null ? void 0 : _a2.remember_state) {
              localStorage.setItem("picasso_chat_state", "false");
            }
          } }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: chatWindowRef, className: "chat-window", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "chat-header-spacer" }),
            messages.map((msg, idx) => {
              const isLastMessage = idx === messages.length - 1;
              return /* @__PURE__ */ jsxRuntimeExports.jsx(
                "div",
                {
                  ref: isLastMessage ? lastMessageRef : null,
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(
                    MessageBubble,
                    {
                      role: msg.role,
                      content: msg.content,
                      files: msg.files,
                      actions: msg.actions,
                      uploadState: msg.uploadState,
                      onCancel: msg.onCancel
                    }
                  )
                },
                msg.id || idx
              );
            }),
            isTyping && /* @__PURE__ */ jsxRuntimeExports.jsx(TypingIndicator, {})
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "chat-footer-container", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "input-container", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InputBar, { input, setInput, onPlusClick: () => setShowAttachmentMenu(true) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChatFooter, { brandText: ((_g = config == null ? void 0 : config.branding) == null ? void 0 : _g.brandText) || "AI" }),
            showAttachmentMenu && ((_h = config == null ? void 0 : config.features) == null ? void 0 : _h.photo_uploads) !== void 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(AttachmentMenu, { onClose: () => setShowAttachmentMenu(false) })
          ] })
        ] })
      ] });
    }
    const performanceMetrics = {
      iframeStartTime: performance.now(),
      configStartTime: null,
      configEndTime: null,
      iframeReadyTime: null
    };
    function notifyParentReady() {
      performanceMetrics.iframeReadyTime = performance.now();
      const loadTime = performanceMetrics.iframeReadyTime - performanceMetrics.iframeStartTime;
      console.log(`⚡ Iframe loaded in ${loadTime.toFixed(2)}ms ${loadTime < 500 ? "✅" : "⚠️ (PRD target: <500ms)"}`);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "PICASSO_IFRAME_READY",
          performance: {
            loadTime,
            configLoadTime: performanceMetrics.configEndTime ? performanceMetrics.configEndTime - performanceMetrics.configStartTime : null
          }
        }, "*");
      }
    }
    function notifyParentEvent(event, payload = {}) {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: "PICASSO_EVENT",
          event,
          payload
        }, "*");
      }
    }
    function setupCommandListener() {
      window.addEventListener("message", (event) => {
        if (event.data.type === "PICASSO_COMMAND") {
          const { action, payload } = event.data;
          switch (action) {
            case "OPEN_CHAT":
              console.log("📡 Received OPEN_CHAT command");
              document.body.classList.add("chat-open");
              notifyParentEvent("CHAT_OPENED");
              break;
            case "CLOSE_CHAT":
              console.log("📡 Received CLOSE_CHAT command");
              document.body.classList.remove("chat-open");
              notifyParentEvent("CHAT_CLOSED");
              break;
            case "UPDATE_CONFIG":
              console.log("📡 Received UPDATE_CONFIG command:", payload);
              break;
            default:
              console.log("❓ Unknown command:", action);
          }
        }
      });
    }
    function initializeWidget() {
      const container = document.getElementById("root");
      if (!container) {
        console.error("Picasso Widget: Root container not found");
        return;
      }
      try {
        console.log("🚀 DOM ready, setting up iframe context...");
        document.body.setAttribute("data-iframe", "true");
        document.documentElement.setAttribute("data-iframe-context", "true");
        console.log("✅ Set data-iframe-context on HTML element for maximum CSS specificity");
        const urlParams = new URLSearchParams(window.location.search);
        const tenantHash = urlParams.get("t");
        if (!tenantHash) {
          console.error("Widget: No tenant hash provided in URL parameter 't', iframe initialization failed");
          return;
        }
        console.log("🔑 Using tenant hash:", tenantHash);
        if (!window.PicassoConfig) {
          window.PicassoConfig = {
            mode: "widget",
            tenant: tenantHash,
            tenant_id: tenantHash,
            iframe_mode: false
            // Allow normal API loading
          };
          console.log("✅ Set iframe config to use live API with tenant hash:", tenantHash);
        }
        window.fetchTenantConfig = () => __async(null, null, function* () {
          performanceMetrics.configStartTime = performance.now();
          try {
            const cacheKey = `picasso_config_${tenantHash}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
              try {
                const cachedConfig = JSON.parse(cached);
                const cacheAge = Date.now() - (cachedConfig._cached || 0);
                if (cacheAge < 3e5) {
                  performanceMetrics.configEndTime = performance.now();
                  const loadTime2 = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
                  console.log(`⚡ Config loaded from cache in ${loadTime2.toFixed(2)}ms ✅`);
                  return cachedConfig;
                }
              } catch (e) {
                console.warn("Invalid cached config, fetching fresh");
              }
            }
            const configUrl = `https://chat.myrecruiter.ai/Master_Function?action=get_config&t=${encodeURIComponent(tenantHash)}`;
            console.log("🔄 Fetching config from:", configUrl);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5e3);
            const response = yield fetch(configUrl, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
              },
              mode: "cors",
              credentials: "omit",
              cache: "no-cache",
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const config = yield response.json();
            config._cached = Date.now();
            try {
              sessionStorage.setItem(cacheKey, JSON.stringify(config));
            } catch (e) {
              console.warn("Failed to cache config:", e);
            }
            performanceMetrics.configEndTime = performance.now();
            const loadTime = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
            console.log(`⚡ Config fetched in ${loadTime.toFixed(2)}ms ${loadTime < 200 ? "✅" : "⚠️ (PRD target: <200ms)"}`);
            return config;
          } catch (error) {
            performanceMetrics.configEndTime = performance.now();
            const loadTime = performanceMetrics.configEndTime - performanceMetrics.configStartTime;
            console.error(`❌ Failed to fetch config in ${loadTime.toFixed(2)}ms:`, error);
            return {
              tenant_id: tenantHash,
              tenant_hash: tenantHash,
              chat_title: "Chat Assistant",
              welcome_message: "Hello! How can I help you today?",
              branding: {
                primary_color: "#3b82f6",
                background_color: "#ffffff",
                font_color: "#374151",
                chat_title: "Chat Assistant"
              },
              features: {
                quick_help: { enabled: true },
                action_chips: { enabled: true },
                callout: { enabled: true }
              },
              widget_behavior: {
                auto_open: false,
                auto_open_delay: 3
              }
            };
          }
        });
        const existingScript = document.querySelector('script[src*="widget.js"]');
        if (!existingScript) {
          const mockScript = document.createElement("script");
          mockScript.setAttribute("data-tenant", tenantHash);
          document.head.appendChild(mockScript);
          console.log("✅ Added compatibility script tag with tenant hash:", tenantHash);
        }
        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";
        document.body.style.margin = "0";
        document.body.style.padding = "0";
        container.style.height = "100%";
        container.style.display = "flex";
        container.style.flexDirection = "column";
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #f0f0f0; color: #333; font-family: system-ui; flex-direction: column; gap: 10px;"><div>🎨 Loading Picasso...</div><div style="font-size: 12px; opacity: 0.7;">Iframe mode detected</div></div>';
        const isIframe = document.body.getAttribute("data-iframe");
        console.log("✅ data-iframe attribute set to:", isIframe);
        console.log("✅ Iframe height setup complete");
        const root = clientExports.createRoot(container);
        root.render(
          /* @__PURE__ */ jsxRuntimeExports.jsx(ConfigProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChatProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(CSSVariablesProvider, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChatWidget, {}) }) }) })
        );
        console.log("✅ Picasso Widget iframe initialized successfully");
        notifyParentReady();
        setupCommandListener();
      } catch (error) {
        console.error("❌ Error initializing Picasso Widget:", error);
        container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #ffe6e6; color: #d63031; font-family: system-ui; text-align: center; padding: 20px;">
      <div>
        <h3>Picasso Widget Error</h3>
        <p>${error.message}</p>
        <small>Check console for details</small>
      </div>
    </div>`;
      }
    }
    function startIframe() {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeWidget);
      } else if (document.readyState === "interactive" || document.readyState === "complete") {
        setTimeout(initializeWidget, 10);
      }
    }
    startIframe();
  }
});
export default require_iframe_main();
//# sourceMappingURL=iframe-main.js.map
