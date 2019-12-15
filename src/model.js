export default function model($model, $funcLibRaw, $batchingStrategy) {
    let $funcLib = $funcLibRaw

    if (/* DEBUG */false) {
    $funcLib = (!$funcLibRaw || typeof Proxy === 'undefined') ? $funcLibRaw : new Proxy($funcLibRaw, {
      get: (target, functionName) => {
        if (target[functionName]) {
          return target[functionName]
        }

        throw new TypeError(`Trying to call undefined function: ${functionName} `)
    }})
  }

  function mathFunction(name, source) {
    return arg => {
      const type = typeof arg
      if (type !== 'number') {
        throw new TypeError(`Trying to call ${JSON.stringify(arg)}.${name}. Expects number, received ${type} at ${source}`)
      }

      return Math[name](arg)
    }
  }

  function checkTypes(input, name, types, functionName, source) {
    function checkType(type) {
      const isArray = Array.isArray(input)
      return type == 'array' && isArray || (type === typeof input && !isArray)
    }

    if (types.some(checkType)) {
      return
    }

    const asString = typeof input === 'object' ? JSON.stringify(input) : input

    throw new TypeError(`${functionName} expects ${types.join('/')}. ${name} at ${source}: ${asString}.${functionName}`)
  }

  const $res = { $model };
    const $listeners = new Set();
    const $trackingMap = new WeakMap();
    const $trackingWildcards = new WeakMap();
    const $invalidatedMap = new WeakMap();
    const $invalidatedRoots = new Set();
    $invalidatedRoots.$subKeys = {};
    $invalidatedRoots.$parentKey = null;
    $invalidatedRoots.$parent = null;
    $invalidatedRoots.$tracked = {};
    let $first = true;
    let $tainted = new WeakSet();
    $invalidatedMap.set($res, $invalidatedRoots);

    function untrack($targetKeySet, $targetKey){
      const $tracked = $targetKeySet.$tracked;
      if (!$tracked || !$tracked[$targetKey]) {
        return;
      }
      const $trackedByKey = $tracked[$targetKey];
      for (let i = 0; i < $trackedByKey.length; i+=3) {
        const $trackingSource = $trackingMap.get($trackedByKey[i]);
        $trackingSource[$trackedByKey[i+1]].delete($trackedByKey[i+2]);
      }
      delete $tracked[$targetKey];
    }

    function invalidate($targetKeySet, $targetKey){
      if ($targetKeySet.has($targetKey)) {
        return;
      }
      $targetKeySet.add($targetKey);
      untrack($targetKeySet, $targetKey);
      if ($targetKeySet.$parent) {
        invalidate($targetKeySet.$parent, $targetKeySet.$parentKey);
      }
    }

    function setOnObject($target, $key, $val, $new) {
      let $changed = false;
      let $hard = false;
      if (!$new) {
        if (typeof $target[$key] === 'object' && $target[$key] && $target[$key] !== $val) {
          $hard = true;
        }
        if (
          $hard ||
          $target[$key] !== $val ||
          ($val && typeof $val === 'object' && $tainted.has($val)) ||
          (!$target.hasOwnProperty($key) && $target[$key] === undefined)
        ) {
          $changed = true;
          triggerInvalidations($target, $key, $hard);
        }
      }
      $target[$key] = $val;
    }

  function deleteOnObject($target, $key, $new) {
    let $hard = false;
    if (!$new) {
      if (typeof $target[$key] === 'object' && $target[$key]) {
        $hard = true;
      }
      triggerInvalidations($target, $key, $hard);
      const $invalidatedKeys = $invalidatedMap.get($target);
      if ($invalidatedKeys) {
        delete $invalidatedKeys.$subKeys[$key]
      }
    }
    delete $target[$key];
    }

    function setOnArray($target, $key, $val, $new) {
      let $hard = false;
      if (!$new) {
        if (typeof $target[$key] === 'object' && $target[$key] && $target[$key] !== $val) {
          $hard = true;
        }
        if (
          $hard ||
          $key >= $target.length ||
          $target[$key] !== $val ||
          ($val && typeof $target[$key] === 'object' && $tainted.has($val))
        ) {
          triggerInvalidations($target, $key, $hard);
        }
      }
      $target[$key] = $val;
    }

    function truncateArray($target, newLen) {
      const $invalidatedKeys = $invalidatedMap.get($target);
      for (let i = newLen; i <$target.length;i++) {
        triggerInvalidations($target, i, true);
        if ($invalidatedKeys) {
          delete $invalidatedKeys.$subKeys[i]
        }
      }
      $target.length = newLen;
    }

    function track($target, $sourceObj, $sourceKey, $soft) {
      if (!$trackingMap.has($sourceObj)) {
        $trackingMap.set($sourceObj, {});
      }
      const $track = $trackingMap.get($sourceObj);
      $track[$sourceKey] = $track[$sourceKey] || new Map();
      $track[$sourceKey].set($target, $soft);
      const $tracked = $target[0].$tracked;
      $tracked[$target[1]] = $tracked[$target[1]] || [];
      $tracked[$target[1]].push($sourceObj, $sourceKey, $target);
    }

    function trackPath($target, $path) {
      const $end = $path.length - 2;
      let $current = $path[0];
      for (let i = 0; i <= $end; i++) {
        track($target, $current, $path[i + 1], i !== $end);
        $current = $current[$path[i + 1]];
      }
    }

    function triggerInvalidations($sourceObj, $sourceKey, $hard) {
      $tainted.add($sourceObj);
      const $track = $trackingMap.get($sourceObj);
      if ($track && $track.hasOwnProperty($sourceKey)) {
        $track[$sourceKey].forEach(($soft, $target) => {
          if (!$soft || $hard) {
            invalidate($target[0], $target[1]);
          }
        });
      }
      if ($trackingWildcards.has($sourceObj)) {
        $trackingWildcards.get($sourceObj).forEach($targetInvalidatedKeys => {
          invalidate($targetInvalidatedKeys, $sourceKey);
        });
      }
    }

    function initOutput($tracked, src, func, createDefaultValue, createCacheValue) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      let $cachedByFunc = $cachePerTargetKey.get(func);
      if (!$cachedByFunc) {
        const $resultObj = createDefaultValue();
        const $cacheValue = createCacheValue();
        const $invalidatedKeys = new Set();
        $invalidatedKeys.$subKeys = {};
        $invalidatedKeys.$parentKey = $tracked[1];
        $invalidatedKeys.$parent = $tracked[0];
        $invalidatedKeys.$tracked = {};
        $invalidatedMap.set($resultObj, $invalidatedKeys);
        $cachedByFunc = [null, $resultObj, $invalidatedKeys, true, $cacheValue];
        $cachePerTargetKey.set(func, $cachedByFunc);
      } else {
        $cachedByFunc[3] = false;
      }
      const $invalidatedKeys = $cachedByFunc[2];
      const $prevSrc = $cachedByFunc[0];
      if ($prevSrc !== src) {
        if ($prevSrc) { // prev mapped to a different collection
          $trackingWildcards.get($prevSrc).delete($invalidatedKeys);
          if (Array.isArray($prevSrc)) {
            $prevSrc.forEach((_item, index) => $invalidatedKeys.add(index));
          } else {
            Object.keys($prevSrc).forEach(key => $invalidatedKeys.add(key));
          }
          if (Array.isArray(src)) {
            src.forEach((_item, index) => $invalidatedKeys.add(index));
          } else {
            Object.keys(src).forEach(key => $invalidatedKeys.add(key));
          }
        }
        if (!$trackingWildcards.has(src)) {
          $trackingWildcards.set(src, new Set());
        }
        $trackingWildcards.get(src).add($invalidatedKeys);
        $cachedByFunc[0] = src;
      }
      return $cachedByFunc;
    }

    const emptyObj = () => ({});
    const emptyArr = () => [];
    const nullFunc = () => null;

    function mapValuesOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      (($new && Object.keys(src)) || $invalidatedKeys).forEach(key => {
        if (!src.hasOwnProperty(key)) {
          if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $new);
          }
        } else {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          setOnObject($out, key, res, $new);
        }
      });
      $invalidatedKeys.clear();
      return $out;
    }


    function filterByOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      (($new && Object.keys(src)) || $invalidatedKeys).forEach(key => {
        if (!src.hasOwnProperty(key)) {
          if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $new);
          }
        } else {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          if (res) {
            setOnObject($out, key, src[key], $new);
          } else if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $new);
          }
        }
      });
      $invalidatedKeys.clear();
      return $out;
    }

    function mapOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          setOnArray($out, key, res, $new);
        }
      } else {
        $invalidatedKeys.forEach(key => {
          if (key < src.length) {
            const res = func([$invalidatedKeys, key], key, src[key], context);
            setOnArray($out, key, res, $new);
          }
        })
        if ($out.length > src.length) {
          truncateArray($out, src.length)
        }
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function recursiveSteps(key, $tracked) {
      const { $dependencyMap, $currentStack, $invalidatedKeys, $out, func, src, context, $new } = this;
      if ($currentStack.length > 0) {
        if (!$dependencyMap.has(key)) {
          $dependencyMap.set(key, []);
        }
        $dependencyMap.get(key).push($tracked);
      }
      if ($invalidatedKeys.has(key)) {
        $currentStack.push(key);
        if (Array.isArray($out)) {
          if (key >= src.length) {
            setOnArray($out, key, undefined, $new);
            $out.length = src.length;
          } else {
            const newVal = func([$invalidatedKeys, key], key, src[key], context, this);
            setOnArray($out, key, newVal, $new)
          }
        } else {
          if (!src.hasOwnProperty(key)) {
            if ($out.hasOwnProperty(key)) {
              deleteOnObject($out, key, $new);
            }
          } else {
            const newVal = func([$invalidatedKeys, key], key, src[key], context, this);
            setOnObject($out, key, newVal, $new)
          }
        }
        $invalidatedKeys.delete(key);
        $currentStack.pop();
      }
      return $out[key];
    }

    function cascadeRecursiveInvalidations($loop) {
      const { $dependencyMap, $invalidatedKeys } = $loop;
      $invalidatedKeys.forEach(key => {
        if ($dependencyMap.has(key)) {
          $dependencyMap.get(key).forEach(($tracked) => {
            invalidate($tracked[0], $tracked[1]);
          });
          $dependencyMap.delete(key);
        }
      });
    }

    const recursiveCacheFunc = () => ({
      $dependencyMap: new Map(),
      $currentStack: [],
      recursiveSteps
    })

    function recursiveMapOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, recursiveCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $loop = $storage[4];
      $loop.$invalidatedKeys = $invalidatedKeys;
      $loop.$out = $out;
      $loop.context = context;
      $loop.func = func;
      $loop.src = src;
      $loop.$new = $new;

      if ($new) {
        for (let key = 0; key < src.length; key++) {
          $invalidatedKeys.add(key);
        }
        for (let key = 0; key < src.length; key++) {
          $loop.recursiveSteps(key, [$invalidatedKeys, key]);
        }
      } else {
        cascadeRecursiveInvalidations($loop);
        $invalidatedKeys.forEach(key => {
          $loop.recursiveSteps(key, [$invalidatedKeys, key]);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function recursiveMapValuesOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, recursiveCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $loop = $storage[4];
      $loop.$invalidatedKeys = $invalidatedKeys;
      $loop.$out = $out;
      $loop.context = context;
      $loop.func = func;
      $loop.src = src;
      $loop.$new = $new;

      if ($new) {
        Object.keys(src).forEach(key => $invalidatedKeys.add(key));
        Object.keys(src).forEach(key => $loop.recursiveSteps(key, $invalidatedKeys, key));
      } else {
        cascadeRecursiveInvalidations($loop);
        $invalidatedKeys.forEach(key => {
          $loop.recursiveSteps(key, $invalidatedKeys, key);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function keyByOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyArr);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $cache = $storage[4];
      if ($new) {
        $cache.indexToKey = []
        $cache.keyToIndices = {}
        for (let index = 0; index < src.length; index++) {
          const key = '' + func([$invalidatedKeys, index], index, src[index], context);
          $cache.indexToKey[index] = key
          $cache.keyToIndices[key] = $cache.keyToIndices[key] || new Set()
          $cache.keyToIndices[key].add(index)
          setOnObject($out, key, src[index], $new);
        }
      } else {
        const keysPendingDelete = new Set();
        $invalidatedKeys.forEach(index => {
          if (index < $cache.indexToKey.length) {
            const key = $cache.indexToKey[index];
            $cache.keyToIndices[key].delete(index)
            if ($cache.keyToIndices[key].size === 0) {
              delete $cache.keyToIndices[key]
              keysPendingDelete.add(key);
            }
          }
        });
        $invalidatedKeys.forEach(index => {
          if (index < src.length) {
            const key = '' + func([$invalidatedKeys, index], index, src[index], context);
            $cache.indexToKey[index] = key
            keysPendingDelete.delete(key)
            $cache.keyToIndices[key] = $cache.keyToIndices[key] || new Set();
            $cache.keyToIndices[key].add(index)
            setOnObject($out, key, src[index], $new);
          }
        });

        keysPendingDelete.forEach(key => {
          deleteOnObject($out, key, $new)
        });
      }
      $cache.indexToKey.length = src.length;
      $invalidatedKeys.clear();
      return $out;
    }

    function mapKeysOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyObj);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $keyToKey = $storage[4];
      if ($new) {
        Object.keys(src).forEach(key => {
          const newKey = func([$invalidatedKeys, key], key, src[key], context);
          setOnObject($out, newKey, src[key], $new);
          $keyToKey[key] = newKey;
        });
      } else {
        const keysPendingDelete = new Set();
        $invalidatedKeys.forEach(key => {
          if ($keyToKey.hasOwnProperty(key)) {
            keysPendingDelete.add($keyToKey[key]);
            delete $keyToKey[key];
          }
        });
        $invalidatedKeys.forEach(key => {
          if (src.hasOwnProperty(key)) {
            const newKey = func([$invalidatedKeys, key], key, src[key], context);
            setOnObject($out, newKey, src[key], $new);
            $keyToKey[key] = newKey;
            keysPendingDelete.delete(newKey);
          }
        });
        keysPendingDelete.forEach(key => {
          deleteOnObject($out, key, $new);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    const filterCacheFunc = () => [0];

    function filterOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, filterCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $idxToIdx = $storage[4];
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          const passed = !!func([$invalidatedKeys, key], key, src[key], context);
          const prevItemIdx = $idxToIdx[key];
          const nextItemIdx = passed ? prevItemIdx + 1 : prevItemIdx;
          $idxToIdx[key + 1] = nextItemIdx;
          if (nextItemIdx !== prevItemIdx) {
            setOnArray($out, prevItemIdx, src[key], $new);
          }
        }
      } else {
        let firstIndex = Number.MAX_SAFE_INTEGER;
        $invalidatedKeys.forEach(key => (firstIndex = Math.min(firstIndex, key)));
        for (let key = firstIndex; key < src.length; key++) {
          const passed = !!func([$invalidatedKeys, key], key, src[key], context);
          const prevItemIdx = $idxToIdx[key];
          const nextItemIdx = passed ? prevItemIdx + 1 : prevItemIdx;
          $idxToIdx[key + 1] = nextItemIdx;
          if (nextItemIdx !== prevItemIdx) {
            setOnArray($out, prevItemIdx, src[key], $new);
          }
        }
        $idxToIdx.length = src.length + 1;
        truncateArray($out, $idxToIdx[$idxToIdx.length - 1]);
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function anyOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      // $out has at most 1 key - the one that stopped the previous run because it was truthy
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          $invalidatedKeys.add(key);
        }
      }
      const $prevStop = $out.length > 0 ? $out[0] : -1;
      if ($prevStop >= 0 && $prevStop < src.length) {
        if ($invalidatedKeys.has($prevStop)) {
          $invalidatedKeys.delete($prevStop);
          const passedTest = func([$invalidatedKeys, $prevStop], $prevStop, src[$prevStop], context);
          if (!passedTest) {
            $out.length = 0;
          }
        }
      } else {
        $out.length = 0;
      }
      if ($out.length === 0) {
        for (let key of $invalidatedKeys) {
          $invalidatedKeys.delete(key);
          if (key >= 0 && key < src.length) {
            const match = func([$invalidatedKeys, key], key, src[key], context);
            if (match) {
              $out[0] = key;
              break;
            }
          }
        }
      }
      return $out.length === 1;
    }


    function anyValuesOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      // $out has at most 1 key - the one that stopped the previous run because it was truthy
      if ($new) {
        Object.keys(src).forEach(key => $invalidatedKeys.add(key))
      }
      const $prevStop = $out.length > 0 ? $out[0] : null;
      if ($prevStop !== null && src.hasOwnProperty($prevStop)) {
        if ($invalidatedKeys.has($prevStop)) {
          $invalidatedKeys.delete($prevStop);
          const passedTest = func([$invalidatedKeys, $prevStop], $prevStop, src[$prevStop], context);
          if (!passedTest) {
            $out.length = 0;
          }
        }
      } else {
        $out.length = 0;
      }
      if ($out.length === 0) {
        for (let key of $invalidatedKeys) {
          $invalidatedKeys.delete(key);
          if (src.hasOwnProperty(key)) {
            const match = func([$invalidatedKeys, key], key, src[key], context);
            if (match) {
              $out[0] = key;
              break;
            }
          }
        }
      }
      return $out.length === 1;
    }

    function groupByOpt($tracked, identifier, func, src, context) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyObj);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $keyToKey = $storage[4];
      if (Array.isArray(src)) {
        throw new Error('groupBy only works on objects');
      }
      if ($new) {
        Object.keys(src).forEach(key => {
          const res = '' + func([$invalidatedKeys, key], key, src[key], context);
          $keyToKey[key] = res;
          if (!$out[res]) {
            setOnObject($out, res, {}, $new);
          }
          setOnObject($out[res], key, src[key], $new);
        });
      } else {
        const keysPendingDelete = {};
        $invalidatedKeys.forEach(key => {
          if ($keyToKey[key]) {
            keysPendingDelete[$keyToKey[key]] = keysPendingDelete[$keyToKey[key]] || new Set();
            keysPendingDelete[$keyToKey[key]].add(key);
          }
        });
        $invalidatedKeys.forEach(key => {
          if (!src.hasOwnProperty(key)) {
            delete $keyToKey[key]
            return;
          }
          const res = '' + func([$invalidatedKeys, key], key, src[key], context);
          $keyToKey[key] = res;
          if (!$out[res]) {
            $out[res] = {};
          }
          setOnObject($out[res], key, src[key], $new);
          setOnObject($out, res, $out[res], $new);
          if (keysPendingDelete.hasOwnProperty(res)) {
            keysPendingDelete[res].delete(key);
          }
        });
        Object.keys(keysPendingDelete).forEach(res => {
          if (keysPendingDelete[res].size > 0) {
            keysPendingDelete[res].forEach(key => {
              deleteOnObject($out[res], key, $new);
            });
            if (Object.keys($out[res]).length === 0) {
              deleteOnObject($out, res, $new);
            } else {
              setOnObject($out, res, $out[res], $new);
            }
          }
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    const valuesOrKeysCacheFunc = () => ({$keyToIdx: {}, $idxToKey: []});

    function valuesOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, valuesOrKeysCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const { $keyToIdx, $idxToKey } = $storage[4];

      if ($new) {
        Object.keys(src).forEach((key, idx) => {
          $out[idx] = src[key];
          $idxToKey[idx] = key;
          $keyToIdx[key] = idx;
        });
      } else {
        const $deletedKeys = [];
        const $addedKeys = [];
        const $touchedKeys = [];
        $invalidatedKeys.forEach(key => {
          if (src.hasOwnProperty(key) && !$keyToIdx.hasOwnProperty(key)) {
            $addedKeys.push(key);
          } else if (!src.hasOwnProperty(key) && $keyToIdx.hasOwnProperty(key)) {
            $deletedKeys.push(key);
          } else {
            if ($keyToIdx.hasOwnProperty(key)) {
              setOnObject($out, $keyToIdx[key], src[key], $new);
            }
          }
        });
        if ($addedKeys.length < $deletedKeys.length) {
          $deletedKeys.sort((a, b) => $keyToIdx[a] - $keyToIdx[b]);
        }
        const $finalOutLength = $out.length - $deletedKeys.length + $addedKeys.length;
        // keys both deleted and added fill created holes first
        for (let i = 0; i < $addedKeys.length && i < $deletedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $deletedKey = $deletedKeys[i];
          const $newIdx = $keyToIdx[$deletedKey];
          delete $keyToIdx[$deletedKey];
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, src[$addedKey], $new)
        }
        // more keys added - append to end
        for (let i = $deletedKeys.length; i < $addedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $newIdx = $out.length;
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, src[$addedKey], $new)
        }
        // more keys deleted - move non deleted items at the tail to the location of deleted
        const $deletedNotMoved = $deletedKeys.slice($addedKeys.length);
        const $deletedNotMovedSet = new Set($deletedKeys.slice($addedKeys.length));
        const $keysToMoveInside = new Set(
          $idxToKey.slice($finalOutLength).filter(key => !$deletedNotMovedSet.has(key))
        );
        let $savedCount = 0;
        for (let $tailIdx = $finalOutLength; $tailIdx < $out.length; $tailIdx++) {
          const $currentKey = $idxToKey[$tailIdx];
          if ($keysToMoveInside.has($currentKey)) {
            // need to move this key to one of the pending delete
            const $switchedWithDeletedKey = $deletedNotMoved[$savedCount];
            const $newIdx = $keyToIdx[$switchedWithDeletedKey];
            setOnArray($out, $newIdx, src[$currentKey], $new);
            $keyToIdx[$currentKey] = $newIdx;
            $idxToKey[$newIdx] = $currentKey;
            delete $keyToIdx[$switchedWithDeletedKey];
            $savedCount++;
          } else {
            delete $keyToIdx[$currentKey];
          }
        }
        truncateArray($out, $finalOutLength);
        $idxToKey.length = $out.length;
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function keysOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, valuesOrKeysCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const { $keyToIdx, $idxToKey } = $storage[4];

      if ($new) {
        Object.keys(src).forEach((key, idx) => {
          $out[idx] = key;
          $idxToKey[idx] = key;
          $keyToIdx[key] = idx;
        });
      } else {
        const $deletedKeys = [];
        const $addedKeys = [];
        const $touchedKeys = [];
        $invalidatedKeys.forEach(key => {
          if (src.hasOwnProperty(key) && !$keyToIdx.hasOwnProperty(key)) {
            $addedKeys.push(key);
          } else if (!src.hasOwnProperty(key) && $keyToIdx.hasOwnProperty(key)) {
            $deletedKeys.push(key);
          } else {
            if ($keyToIdx.hasOwnProperty(key)) {
              setOnObject($out, $keyToIdx[key], key, $new);
            }
          }
        });
        if ($addedKeys.length < $deletedKeys.length) {
          $deletedKeys.sort((a, b) => $keyToIdx[a] - $keyToIdx[b]);
        }
        const $finalOutLength = $out.length - $deletedKeys.length + $addedKeys.length;
        // keys both deleted and added fill created holes first
        for (let i = 0; i < $addedKeys.length && i < $deletedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $deletedKey = $deletedKeys[i];
          const $newIdx = $keyToIdx[$deletedKey];
          delete $keyToIdx[$deletedKey];
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, $addedKey, $new)
        }
        // more keys added - append to end
        for (let i = $deletedKeys.length; i < $addedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $newIdx = $out.length;
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, $addedKey, $new)
        }
        // more keys deleted - move non deleted items at the tail to the location of deleted
        const $deletedNotMoved = $deletedKeys.slice($addedKeys.length);
        const $deletedNotMovedSet = new Set($deletedKeys.slice($addedKeys.length));
        const $keysToMoveInside = new Set(
          $idxToKey.slice($finalOutLength).filter(key => !$deletedNotMovedSet.has(key))
        );
        let $savedCount = 0;
        for (let $tailIdx = $finalOutLength; $tailIdx < $out.length; $tailIdx++) {
          const $currentKey = $idxToKey[$tailIdx];
          if ($keysToMoveInside.has($currentKey)) {
            // need to move this key to one of the pending delete
            const $switchedWithDeletedKey = $deletedNotMoved[$savedCount];
            const $newIdx = $keyToIdx[$switchedWithDeletedKey];
            setOnArray($out, $newIdx, $currentKey, $new);
            $keyToIdx[$currentKey] = $newIdx;
            $idxToKey[$newIdx] = $currentKey;
            delete $keyToIdx[$switchedWithDeletedKey];
            $savedCount++;
          } else {
            delete $keyToIdx[$currentKey];
          }
        }
        truncateArray($out, $finalOutLength);
        $idxToKey.length = $out.length;
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function getEmptyArray($tracked, token) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      if (!$cachePerTargetKey.has(token)) {
        $cachePerTargetKey.set(token, []);
      }
      return $cachePerTargetKey.get(token);
    }

    function getEmptyObject($tracked, token) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      if (!$cachePerTargetKey.has(token)) {
        $cachePerTargetKey.set(token, {});
      }
      return $cachePerTargetKey.get(token);
    }

    function array($tracked, newVal, identifier, len) {
      const res = getEmptyArray($tracked, identifier);
      const $new = res.length === 0;
      for (let i = 0; i < len; i++) {
        setOnArray(res, i, newVal[i], $new);
      }
      return res;
    }

    function object($tracked, valsList, identifier, keysList) {
      const res = getEmptyObject($tracked, identifier);
      const $new = keysList.length && !res.hasOwnProperty(keysList[0]);
      for (let i = 0; i < keysList.length; i++) {
        const name = keysList[i];
        setOnObject(res, name, valsList[i], $new);
      }
      return res;
    }

    function call($tracked, newVal, identifier, len) {
      const arr = getEmptyArray($tracked, identifier);
      const $new = arr.length === 0;
      if ($new) {
        arr.push([]);
      }
      const args = arr[0];
      for (let i = 0; i < len; i++) {
        setOnArray(args, i, newVal[i], $new);
      }
      if (arr.length === 1 || $tainted.has(args)) {
        arr[1] = $funcLib[args[0]].apply($res, args.slice(1));
      }
      return arr[1];
    }

    function bind($tracked, newVal, identifier, len) {
      const arr = getEmptyArray($tracked, identifier);
      if (arr.length === 0) {
        arr.push([]);
      }
      const args = arr[0];
      for (let i = 0; i < len; i++) {
        args[i] = newVal[i];
      }
      if (arr.length === 1) {
        arr[1] = (...extraArgs) => {
          const fn = $funcLibRaw[args[0]] || $res[args[0]];
          return fn.apply($res, args.slice(1).concat(extraArgs));
        };
      }
      return arr[1]
    }

    function assignOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      if ($new) {
        Object.assign($out, ...src);
      } else {
        const res = Object.assign({}, ...src);
        Object.keys(res).forEach(key => {
          setOnObject($out, key, res[key], $new);
        });
        Object.keys($out).forEach(key => {
          if (!res.hasOwnProperty(key)) {
            deleteOnObject($out, key, $new);
          }
        });
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function defaultsOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      src = [...src].reverse();
      if ($new) {
        Object.assign($out, ...src);
      } else {
        const res = Object.assign({}, ...src);
        Object.keys(res).forEach(key => {
          setOnObject($out, key, res[key], $new);
        });
        Object.keys($out).forEach(key => {
          if (!res.hasOwnProperty(key)) {
            deleteOnObject($out, key, $new);
          }
        });
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function flattenOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, emptyArr)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      const $cache = $storage[4]
      const length = src.length
      const initialLength = $out.length
      if($new) {
        for(let pos=0, i=0;i<length;i+=1) {
          $cache[i] = src[i].length
          for(let j=0;j<$cache[i];j+=1) {
            $out[pos+j] = src[i][j]
          }
          pos += $cache[i]
        }
      } else {
        let pos=0
        for(let key=0;key<length;key+=1) {
          let partLen = src[key].length
          if($invalidatedKeys.has(key)) {
            if($cache[key] && $cache[key] === partLen) {
              src[key].forEach((value, index) => setOnArray($out, pos+index, value, $new))
              pos += $cache[key]
            } else {
              for(;key<length;key+=1) {
                partLen = src[key].length
                src[key].forEach((value, index) => setOnArray($out, pos+index, value, $new))
                $cache[key] = partLen
                pos += partLen
              }
            }
          } else {
            pos += partLen
          }
        }
        $invalidatedKeys.clear()

        initialLength !== pos && truncateArray($out, pos)
      }

      return $out
    }

    function sizeOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      if ($new) {
        $out[0] = Array.isArray(src) ? src.length : Object.keys(src).length
      }
      if (!$new) {
        $out[0] = Array.isArray(src) ? src.length : Object.keys(src).length
        $invalidatedKeys.clear()
      }
      return $out[0]
    }

    function sumOpt($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, emptyArr)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      const $cache = $storage[4]
      const length = src.length
      if($new) {
        $cache[0] = 0
        $cache[1] = []
        for(let i = 0;i<length;i++) {
          $cache[0] += src[i]
          $cache[1][i] = src[i]
        }
      } else {
        $invalidatedKeys.forEach((key) => {
          const cached = $cache[1][key] || 0
          const live = src[key] || 0
          $cache[0] = $cache[0] - cached + live
          $cache[1][key] = live
        })
        $cache[1].length = length
        $invalidatedKeys.clear()
      }
      $out[0] = $cache[0]
      return $out[0]
    }

    function range($tracked, end, start, step, identifier) {
      const $out = getEmptyArray($tracked, identifier);
      let res;
      if ($out.length === 0) {
        res = [];
        $out.push(res);
        for (let val = start; (step > 0 && val < end) || (step < 0 && val > end); val += step) {
          res.push(val);
        }
      } else {
        let len = 0;
        res = $out[0];
        for (let val = start; (step > 0 && val < end) || (step < 0 && val > end); val += step) {
          setOnArray(res, len, val, false);
          len++;
        }
        if (res.length > len) {
          truncateArray(res, len);
        }
      }
      return res;
    }

    function invalidatePath(path) {
        path.forEach((part, index) => {
          triggerInvalidations(getAssignableObject(path, index), part, index === path.length - 1)
        })
    }

    function set(path, value) {
      ensurePath(path)
      invalidatePath(path)
      applySetter(getAssignableObject(path, path.length - 1), path[path.length - 1], value)
    }

    function splice(pathWithKey, len, ...newItems) {
      ensurePath(pathWithKey)
      const key = pathWithKey[pathWithKey.length - 1]
      const path = pathWithKey.slice(0, pathWithKey.length - 1)
      const arr = getAssignableObject(path, path.length)
      const origLength = arr.length;
      const end = len === newItems.length ? key + len : Math.max(origLength, origLength + newItems.length - len);
      for (let i = key; i < end; i++ ) {
        triggerInvalidations(arr, i, true);
      }
      invalidatePath(pathWithKey)
      arr.splice(key, len, ...newItems)
    }
  
    
    const $topLevel = new Array(4).fill(null);
    const object$9Args = [
    'key'
  ];

function comps1$2($tracked, key, val, context) {
    
    const res = call($tracked,["createElement",array($tracked,[val["type"],assignOpt($tracked, array($tracked,[val,object($tracked,[val["compId"]], 9, object$9Args)], 8, 2), 7)], 5, 2)], 4, 2);
    
    return res;
  }

function $compsBuild($tracked) {
    
    
    const newValue = mapOpt($tracked, 2, comps1$2, $model, null);
    
    return newValue
  }

function $rendererBuild($tracked) {
    
    
    const newValue = call($tracked,["createElement",$topLevel[2]], 12, 2);
     trackPath($tracked, [$topLevel,2]);
    return newValue
  }

function $array_model_5_18_1Build($tracked) {
    
    
    const newValue = array($tracked,["Renderer",$topLevel[1]], 15, 2);
     trackPath($tracked, [$topLevel,1]);
    return newValue
  }

const object8Args = [
    'components'
  ];

function $object_model_5_18_2Build($tracked) {
    
    
    const newValue = object($tracked,[$topLevel[0]], 18, object8Args);
     trackPath($tracked, [$topLevel,0]);
    return newValue
  }

    const builderFunctions = [$compsBuild,$object_model_5_18_2Build,$array_model_5_18_1Build,$rendererBuild];
  const builderNames = ["comps","","","renderer"];
  function updateDerived() {
    for (let i = 0; i < 4; i++) {
      if ($first || $invalidatedRoots.has(i)) {
        const newValue = builderFunctions[i]([$invalidatedRoots, i]);
        setOnArray($topLevel, i, newValue, $first);
        if (!$first) {
          $invalidatedRoots.delete(i);
        }
        if (builderNames[i]) {
          $res[builderNames[i]] = newValue;
        }
      }
    }
  }


    let $inBatch = false;
    let $batchPending = [];
    let $inRecalculate = false;

    function recalculate() {
      if ($inBatch) {
        return;
      }
      $inRecalculate = true;
      updateDerived()
      $first = false;
$tainted = new WeakSet();

      $inRecalculate = false;
      if ($batchPending.length) {
        $res.$endBatch();
      } else {
        $listeners.forEach(callback => callback());
      }
    }

    function ensurePath(path) {
      if (path.length < 2) {
        return
      }

      if (path.length > 2) {
        ensurePath(path.slice(0, path.length - 1))
      }

      const lastObjectKey = path[path.length - 2]

      const assignable = getAssignableObject(path, path.length - 2)
      if (assignable[lastObjectKey]) {
        return
      }
      const lastType = typeof path[path.length - 1]
      assignable[lastObjectKey] = lastType === 'number' ? [] : {}
    }

    function getAssignableObject(path, index) {
      return path.slice(0, index).reduce((agg, p) => agg[p], $model)
    }

    function push(path, value) {
      ensurePath([...path, 0])
      const arr = getAssignableObject(path, path.length)
      splice([...path, arr.length], 0, value)
    }

    function applySetter(object, key, value) {
      if (typeof value === 'undefined') {
        delete object[key]
      } else {
        object[key] = value;
      }
    }

    function $setter(func, ...args) {
      if ($inBatch || $inRecalculate || $batchingStrategy) {
        $batchPending.push({ func, args });
        if ((!$inBatch && !$inRecalculate) && $batchingStrategy) {
          $inBatch = true;
          $batchingStrategy.call($res);
        }
      } else {
        func.apply($res, args);
        recalculate();
      }
    }

    Object.assign(
      $res,
      {updateComp: $setter.bind(null, (arg0,...additionalArgs) => set([arg0], ...additionalArgs))},
      {
        $startBatch: () => {
          $inBatch = true;
        },
        $endBatch: () => {
          if ($inRecalculate) {
            throw new Error('Can not end batch in the middle of a batch');
          }
          $inBatch = false;
          if ($batchPending.length) {
            $batchPending.forEach(({ func, args }) => {
              func.apply($res, args);
            });
            $batchPending = [];
            recalculate();
          }
        },
        $runInBatch: func => {
          if ($inRecalculate) {
            func();
          } else {
            $res.$startBatch();
            func();
            $res.$endBatch();
          }
        },
        $addListener: func => {
          $listeners.add(func);
        },
        $removeListener: func => {
          $listeners.delete(func);
        },
        $setBatchingStrategy: func => {
          $batchingStrategy = func;
        }
      }
    );

    if (/* DEBUG */false) {
      Object.assign($res, {
        $ast: () => { return {
  "comps": [
    "*map*",
    [
      "*func*",
      [
        "*call*",
        "createElement",
        [
          "*array*",
          [
            "*get*",
            "type",
            "*val*"
          ],
          [
            "*assign*",
            [
              "*array*",
              "*val*",
              [
                "*object*",
                "key",
                [
                  "*get*",
                  "compId",
                  "*val*"
                ]
              ]
            ]
          ]
        ]
      ]
    ],
    "*root*"
  ],
  "renderer": [
    "*call*",
    "createElement",
    [
      "*get*",
      "$array_model_5_18_1",
      "*topLevel*"
    ]
  ],
  "$array_model_5_18_1": [
    "*array*",
    "Renderer",
    [
      "*get*",
      "$object_model_5_18_2",
      "*topLevel*"
    ]
  ],
  "$object_model_5_18_2": [
    "*object*",
    "components",
    [
      "*get*",
      "comps",
      "*topLevel*"
    ]
  ]
} },
        $source: () => null
      })
    }
    recalculate();
    return $res;
  }