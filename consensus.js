var gData = {
    thresholdOptions: '95,90,85,80,75,70,65,60,55,50',
    thresholds: '90,80,70,60,50'
};

// --------------------------------------------------------------------------------------------------------------------
// Setup the default consensus sets
function mapSetArraysToHash(sets) {
    Object.keys(sets).forEach(function(name) {
        var value = sets[name],
            members = value[1],
            hash = {};

        value[2] = members.length;

        members.forEach(function(aa) {
            hash[aa] = 'dummy';
        });

        value[1] = hash;
    });
};

angular.module('consensus', [])
.directive('checkboxGroup', function() {
    function sortAscending(array) {
        return array.sort(function(a, b) { return a - b; });
    };

    return {
        replace: true,
        restrict: 'E',
        require: 'ngModel',
        scope: {
            optionString: '=',
            agRequired: '='
        },
        templateUrl: 'checkbox-group.html',
        link: function(scope, element, attrs, ngModel) {
            scope.options = scope.optionString.split(',');
            scope.selected = {};

            scope.$watch(function() { return ngModel.$modelValue; }, function(newValue) {
                if (newValue) {
                    ngModel.$modelValue.split(',').forEach(function(value) {
                        var index = scope.options.indexOf(value);
                        if (index >= 0)
                            scope.selected[index] = value;
                    });
                }
                else {
                    ngModel.$setValidity('thresholds', false);
                }
            });

            scope.toggle = function(index, option) {
                if (scope.selected[index])
                    delete scope.selected[index];
                else
                    scope.selected[index] = option;

                var keys = sortAscending(Object.keys(scope.selected)),
                    result = [];
                keys.forEach(function(key) {
                    result.push(scope.selected[key]);
                });

                var result = result.join(',');
                ngModel.$setViewValue(result);
                ngModel.$setValidity('thresholds', !!result);
            };
        }
    };
})
.service('Util', function() {
    this.chop = function(string, nToRemove) {
        return string.substr(0, string.length - nToRemove);
    };

    this.isWhiteSpace = function(ch) {
        switch (ch) {
        case ' ':
        case '\n':
        case '\t':
        case '\r':
        case '\f':
        case '\v':
            return true;
        }
    };

    this.isDigit = function(ch) {
        return ch >= '0' && ch <= '9';
    };

    this.indexOfNonWhitespaceCharacter = function(string) {
        if (!string)
            return -1;

        var i = 0;
        while (this.isWhiteSpace(string[i]))
            ++i;

        return string[i] ? i : -1;
    };
})
.service('ClustalReader', function(Util) {
    var readPos_,
        buffer_;

    var isConsensusLine_ = function(optLine) {
        if (!optLine)
            return false;

        // Does the line begin with at least one space
        if (!Util.isWhiteSpace(optLine[0]))
            return false;

        var hasConsensusChar = false;
        for (var i=1, z=optLine.length; i<z; i++) {
            var ch = optLine[i];
            if (Util.isWhiteSpace(ch))
                continue;

            if (ch === '.' || ch === ':' || ch === '*') {
                hasConsensusChar = true;
                continue;
            }

            // All other characters indicate this is not a consensus line
            return false;
        }

        return hasConsensusChar;
    };

    var parseAlignmentLine_ = function(optLine) {
        var matches = new Array(2);
        if (!optLine)
            return matches;

        // Must begin with a non-space character
        if (Util.isWhiteSpace(optLine[0]))
            return matches;

        // Parse out the identifier
        var x = 1;  // Skip the character we already checked
        while (optLine[x] && !Util.isWhiteSpace(optLine[x]))
            ++x;

        matches[0] = optLine.substr(0, x);

        // Skip all the following whitespace
        while (optLine[x] && Util.isWhiteSpace(optLine[x]))
            ++x;

        // If at the end of the line, no alignment section is present, return null
        if (!optLine[x])
            return [];

        matches[1] = optLine.substr(x).trim();

        return matches;
    };

    this.isCompatibleString = function(chunk) {
        if (!chunk)
            return false;

        var x = Util.indexOfNonWhitespaceCharacter(chunk);
        return (x === 0 || (x > 0 && chunk[x-1] === '\n')) && chunk.substr(x, 7) === 'CLUSTAL';
    };

    this.parseString = function(buffer) {
        var x = Util.indexOfNonWhitespaceCharacter(buffer);
        if (x === -1)
            throw "Empty file";

        readPos_ = x;
        buffer_ = buffer;

        // Read until we find the CLUSTAL header line
        var line = this.readNextLine_();
        if (!/^CLUSTAL/.test(line))
            throw "Missing or invalid CLUSTAL header line";

        line = this.readNextLine_();
        if (!line)
            throw "An alignment line must immediately follow the CLUSTAL header line; none found";

        // Maps id -> 1; used to check if this id has been observed before
        var idTable = {};
        var result;
        while (line) {
            line = line.trim();
            if (!line || isConsensusLine_(line)) {
                line = this.readNextLine_();
                continue;
            }

            var block = [];
            var endOfBlock = false;
            var blockLength;
            while (!endOfBlock) {
                var matches = parseAlignmentLine_(line);
                var isAlignmentLine = matches && matches[0];
                if (!isAlignmentLine) {
                    // This line contains some non-Empty text. Either:
                    // o Consensus line OR
                    // o Junk line OR
                    // o Malformed data line
                    if (!isConsensusLine_(line))
                        throw "malformed alignment line";
                }
                else {
                    var id = matches[0];
                    var gappedSequence = matches[1];
                    var digits = 0;
                    var leadingSpace = false;
                    var spaces = 0;

                    // Remove any terminal numbers that are preceded by a space
                    var i = gappedSequence.length;
                    while (i--) {
                        var ch = gappedSequence[i];
                        if (Util.isDigit(ch))
                            ++digits;
                        else if (Util.isWhiteSpace(ch)) {
                            ++spaces;
                            if (digits) {
                                leadingSpace = true;
                                break;
                            }
                        }
                    }

                    if (leadingSpace)
                        gappedSequence = Util.chop(gappedSequence, digits + spaces);

                    gappedSequence = gappedSequence.replace(/ /g, '');
                    if (blockLength) {
                        if (gappedSequence.length !== blockLength)
                            throw "Alignments do not all have the same length";
                    }
                    else
                        blockLength = gappedSequence.length;

                    block.push([id, gappedSequence]);
                }

                line = this.readNextLine_();
                endOfBlock = !line || line.trim().length === 0;
            }

            // Process this block
            if (result) {
                if (block.length !== result.length)
                    throw "Unequal number of sequences between blocks";

                // Make sure we have the same sequences in this block as in the previous blocks
                var i = result.length;
                while (i--) {
                    var blockId = block[i][0];
                    if (!idTable[blockId])
                        throw "Sequence identifiers are not the same between blocks";

                    var previousId = result[i][0];
                    if (previousId !== blockId)
                        throw "Sequence identifiers different (or in different order) from previous blocks";

                    result[i][1] += block[i][1];
                }
            }
            else {
                result = block;

                var i = result.length;
                while (i--)
                    idTable[result[i][0]] = 1;
            }

            line = this.readNextLine_();
        }

        buffer_ = '';

        if (result.length === 0)
            throw "No sequences found";

        return result;
    };

    this.readNextLine_ = function() {
        if (readPos_ >= buffer_.length)
            return;

        var a = buffer_.indexOf('\n', readPos_);
        var line;
        if (a >= 0) {
            line = buffer_.substr(readPos_, a-readPos_+1);
            readPos_ = a+1;
        }
        else {
            line = buffer_.substr(readPos_);
            readPos_ = buffer_.length;
        }
        return line;
    };
})
.service('Consensus', function() {
    var isGap = function(ch) {
        return ch === '-' || ch === '.';
    };

    var sumAACounts = function(alignment) {
        var rows = alignment.length,
            cols = alignment[0][1].length,
            colCounts = new Array(cols);

        for (var i=0; i<cols; i++)
            colCounts[i] = {};

        for (var i=0; i<rows; i++) {
            var seq = alignment[i][1];
            for (var j=0; j<cols; j++) {
                var ch = seq[j];
                if (isGap(ch))
                    continue;

                var counts = colCounts[j];
                if (!counts[ch])
                    counts[ch] = 1;
                else
                    counts[ch]++;
            }
        }

        return colCounts;
    };

    var arbitrate = function(scores, threshold, sets) {
        var name = '',
            bestName = 'any',
            bestScore = 0;

        Object.keys(sets).forEach(function(name) {
            if (!scores[name] || scores[name] < threshold)
                return;

            // Choose the more specific set
            var noMembers = sets[name][2],
                noBestMembers = sets[bestName][2],

                moreSpecific = noMembers < noBestMembers,
                betterScore = noMembers === noBestMembers && scores[name] > bestScore;
            if (moreSpecific || betterScore) {
                bestName = name;
                bestScore = scores[name];
            }
        });

        return sets[bestName][0];
    };

    var consensusFromCounts = function(colCounts, rows, threshold, sets) {
        var cols = colCounts.length,
            setNames = Object.keys(sets),
            consensus = '';
        for (var i=0; i<cols; i++) {
            var counts = colCounts[i],
                aas = Object.keys(counts),
                scores = {};

            if (!aas.length) {
                consensus += ' ';
                continue;
            }

            // Tally the normalized amount for each set name
            setNames.forEach(function(name) {
                var members = sets[name][1];
                // Walking through every aa in this column
                aas.forEach(function(aa) {
                    if (!members[aa])
                        return;

                    if (!scores[name])
                        scores[name] = counts[aa];
                    else
                        scores[name] += counts[aa];
                });

                if (scores[name])
                    scores[name] = scores[name] * 100. / rows;
            });

            consensus += arbitrate(scores, threshold, sets);
        }

        return consensus;
    };


    this.calc = function(alignment, thresholds, sets) {
        var rows = alignment.length,
            consensii = new Array(thresholds.length),
            colCounts = sumAACounts(alignment);

        for (var i=0; i<thresholds.length; i++) {
            consensii[i] = {
                threshold: thresholds[i],
                symbolString: consensusFromCounts(colCounts, rows, thresholds[i], sets)
            };
        }

        return consensii;
    };
})
.controller('ConsensusCtrl', function($scope, ClustalReader, Consensus) {

var padding_ = 5,
    aaSets = {
        // name -> [symbol, @members, number of members*] * = calculated dynamically
        G: ['G', ['G']],
        A: ['A', ['A']],
        I: ['I', ['I']],
        V: ['V', ['V']],
        L: ['L', ['L']],
        M: ['M', ['M']],
        F: ['F', ['F']],
        Y: ['Y', ['Y']],
        W: ['W', ['W']],
        H: ['H', ['H']],
        C: ['C', ['C']],
        P: ['P', ['P']],
        K: ['K', ['K']],
        R: ['R', ['R']],
        D: ['D', ['D']],
        E: ['E', ['E']],
        Q: ['Q', ['Q']],
        N: ['N', ['N']],
        S: ['S', ['S']],
        T: ['T', ['T']],
        any: ['.', 'GAVILMFYWHCPKRDEQNST'.split('')]
    };


// Reshapes the groups into a form useful for the consensus algorithm
var setsFromGroups = function() {
    var sets = angular.copy(aaSets);

    $scope.groups.forEach(function(group) {
        if (!/\S/.test(group.name) ||
            !/\S/.test(group.symbol) ||
            !/\S/.test(group.members))
            return;

        var name = group.name.trim(),
            symbol = group.symbol.trim()[0],
            members = group.members.replace(/\s+/g, '').split('');

        while (name in sets)
            name += 'x';

        sets[name] = [symbol, members];
    });

    mapSetArraysToHash(sets);

    return sets;
};

var findLongestId = function(alignment) {
    var rows = alignment.length,
        longest = 0;

    for (var i=0; i<rows; i++) {
        var name = alignment[i][0];
        if (name.length > longest)
            longest = name.length;
    }

    return Math.max(longest, 10);
};

var padding = function(label, longestID) {
    return Array(longestID + padding_ - label.length).join(' ');
};

var formatConsensii = function(consensii, longestID) {
    var raw = '';
    consensii.forEach(function(consensus) {
        var label = 'Con_' + consensus.threshold + '%';
        raw += label + padding(label, longestID) + consensus.symbolString + '\n';
    });
    return raw;
};

var format = function(alignment, consensii) {
    var longestID = findLongestId(alignment),
        rawConsensus = formatConsensii(consensii, longestID),
        raw = rawConsensus + '\n';

    alignment.forEach(function(seq) {
        raw += seq[0] + padding(seq[0], longestID) + seq[1] + '\n';
    });

    raw += '\n' + rawConsensus;

    return raw;
};

var defaultGroups = [
    {name: 'aromatic', symbol: 'a', members: 'F Y W H'},
    {name: 'aliphatic', symbol: 'l', members: 'I V L'},
    {name: 'hydrophobic', symbol: 'h', members: 'F Y W H I V L A G M C K R T'},
    {name: 'positive', symbol: '+', members: 'H K R'},
    {name: 'negative', symbol: '-', members: 'D E'},
    {name: 'charged', symbol: 'c', members: 'H K R D E'},
    {name: 'polar', symbol: 'p', members: 'H K R D E Q N S T C'},
    {name: 'alcohol', symbol: 'o', members: 'S T'},
    {name: 'tiny', symbol: 'u', members: 'G A S'},
    {name: 'small', symbol: 's', members: 'G A S V T D N P C'},
    {name: 'turnlike', symbol: 't', members: 'G A S H K R D E Q N S T C'}
];

$scope.groupsVisible = false;
$scope.error;
$scope.data = gData;
$scope.results;
$scope.process = function() {
    $scope.error = null;
    $scope.results = null;

    try {
        var alignment = ClustalReader.parseString($scope.data.rawMsa),
            sets = setsFromGroups($scope.groups),
            consensii = Consensus.calc(alignment, $scope.data.thresholds.split(','), sets);

        $scope.results = format(alignment, consensii);
    }
    catch (error) {
        $scope.error = error;
    }
};

$scope.$watch('data.thresholds', function(newValue) {
    if ($scope.data.rawMsa && newValue)
        $scope.process();
});

$scope.addGroup = function() {
    $scope.groups.push({name: '', symbol: '', members: ''});
    if ($scope.data.rawMsa)
        $scope.process();
};

$scope.removeGroup = function(index) {
    $scope.groups.splice(index, 1);
    if ($scope.data.rawMsa)
        $scope.process();
};

$scope.resetGroups = function() {
    if ($scope.groups === defaultGroups)
        return;

    $scope.groups = angular.copy(defaultGroups);
    if ($scope.data.rawMsa)
        $scope.process();
};

$scope.resetGroups();
})
