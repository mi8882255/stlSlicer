// pathLinesToPathCurve
const pathLinesToPathCurve1 = (pathLinesObj)=> {
    const {pathLines, minLineLength} = pathLinesObj
    const underMinLineLength = minLineLength * 0.5;
    const pathCurve = [];
    //lines : [[x1,y1], [x2,y2], ...]
    //divide points by x, if in one place by y => connect

    // find nearest distances begin=>end
    const connectMap = {
        begin:{}, end:{}, dots:{}
    };

    const dots =[];
    const dotsMap ={};
    const shapes = []
    const lines = []
    // (not needed)sort pathLines begins by x
    pathLines.sort((pathLine1, pathLine2) => pathLine1[0][0]-pathLine2[0][0])

    // add all points to coarse hashmap (underMinLineLength)
    let i = 0;

    // pathLines = [[1,2],[2,3],[3,1]]
    // dotsMap = {1:[-1],2:[-2],3:[-3]
    // lines = [-1, 1],[1,-2],[2,-3],[-2,2]
    
    //
    const getDotHash = (point) => "" + Math.floor(point[0]/underMinLineLength) + '_' + Math.floor(point[1]/underMinLineLength);
    
    //makeDoubleLinkedList [pathLine, prevIndex, nextIndex]
    const dlPathLines = pathLines.map(line => [line, null, null]);

    for (const i in dlPathLines) {
        const startPoint1 = pathLines[i][0];
        const endPoint1 = pathLines[i][1];
        if (getDotHash(startPoint1) === getDotHash(endPoint1)) continue;

        for (const j in dlPathLines) {
            if (i===j) continue;

            const startPoint2 = pathLines[j][0];
            const endPoint2 = pathLines[j][1];

            if (getDotHash(startPoint1) == getDotHash(startPoint2)) {
                dlPathLines[i][1] = j;
                dlPathLines[j][1] = i;
            };

            if (getDotHash(startPoint1) == getDotHash(endPoint2)) {
                dlPathLines[i][1] = j;
                dlPathLines[j][2] = i;
            };

            if (getDotHash(endPoint1) == getDotHash(startPoint2)) {
                dlPathLines[i][2] = j;
                dlPathLines[j][1] = i;
            };

            if (getDotHash(endPoint1) == getDotHash(endPoint2)) {
                dlPathLines[i][2] = j;
                dlPathLines[j][2] = i;
            };
        }
    }
    for (const lineIndex in pathLines) {
        const lineStartPoint = pathLines[lineIndex][0];
        const lineEndPoint = pathLines[lineIndex][1];
        lines.push([-(lineIndex+1), (lineIndex+1)])

        if (!dots[getDotHash(lineStartPoint)]) {
            dotsMap[getDotHash(lineStartPoint)] = -(lineIndex+1);
        } else {
            const oldLineIndex=dotsMap[getDotHash(lineStartPoint)]
            lines.push([oldLineIndex,-(lineIndex+1)])
            
        }
        
        if (!dots[getDotHash(lineEndPoint)]) {
            dotsMap[getDotHash(lineEndPoint)] = (lineIndex+1) ;
        } else {
            const oldLineIndex=dotsMap[getDotHash(lineStartPoint)]
            lines.push([oldLineIndex, (lineIndex+1)])
        }
        
        
        // mapDots["" + Math.floor(lineStartPoint[0]/underMinLineLength) + '_' + Math.floor(lineStartPoint[1]/underMinLineLength)] = lineIndex;
        // mapConnections
    }



    // const connectionsMap=[];
    // // try to connect ends to starts
    // for (const lineIndex in pathLines) {
    //     const lineEndPoint = pathLines[lineIndex][1];
    //     const lineStartPoint = pathLines[lineIndex][0];
    //     const pointIndexInStarts = "" + Math.floor(lineEndPoint[0]/underMinLineLength) + '_' + Math.floor(lineEndPoint[1]/underMinLineLength)

    //     console.log([lineIndex, mapBegins[pointIndexInStarts], lineStartPoint, lineEndPoint])
    //     // connectionsMap.push([lineIndex, mapBegins[pointIndexInStarts], lineEndPoint, pathLines[lineIndex+1][0]]);
    // }
    // connest lines together  
    //for ()

    // console.log(connectionsMap)
    return pathCurve
}

const pathLinesToPathCurve2 = (pathLines, zeroAngle, centerPoint)=> {
    //sort dots by angle
    const dots = []; //element:{ang: num, begin: bool, lineIndex:num}

    for (const lineIndex in pathLines) {
        const lineStartPoint = pathLines[lineIndex][0];
        const lineEndPoint = pathLines[lineIndex][1];

        const startPointAngle = Math.atan2((lineStartPoint[0]-centerPoint[0]), (lineStartPoint[1]-centerPoint[1]))
        const endPointAngle = Math.atan2((lineEndPoint[0]-centerPoint[0]), (lineEndPoint[1]-centerPoint[1]))

        dots.push({
            ang: startPointAngle,
            begin: true,
            lineIndex
        })
        dots.push({
            ang: endPointAngle,
            begin: false,
            lineIndex
        })
    }

    dots.sort((dotA, dotB)=>dotA.ang-dotB.ang)

    return dots;
}
