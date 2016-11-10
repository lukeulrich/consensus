#!/usr/bin/perl -T
# Program: consensus_b.cgi
# Author: Nigel Brown
# Interface Author: Luke Ulrich
# Date: 16 September 2004
# Synopsis: Web interface to the Nigel Brown's consensus program
#
# Modified: --> version b
# Date:     7 April 2005
#           -- Fixed output to adjust to longest id

$| = 1;

use strict;
use warnings;
use CGI qw(:standard);

# Security Measures
$ENV{PATH} = '';
$CGI::POST_MAX        = 1000 * 1024; # limit posts to 1000 kb max

# Globals ----------------------------------------------------------
my @THRESHOLD;
my @ID;
my %ALIGNMENT;
my %SCORE;
my $LENGTH;
my %CONCENSUS;

my $g_LongestID = 0;

print header();
&printBeginHtml();

print STDERR "[$0] Start\n";

# A. Check for input
foreach my $t (param('threshold'))
{
    if ($t =~ m/^\d+$/)
    {
	push @THRESHOLD, $t;
    }
}
@THRESHOLD = (90, 80, 70, 60, 50) if (@THRESHOLD == 0);

my $alndata = &validateParameter('alndata', 0, '^\s*((?:.|\s)+)$');
my $datafile = param('datafile');
if (!defined($alndata) or $alndata eq '')
{
    # Maybe user is attempting to upload data
    if (!defined($datafile) or $datafile eq '')
    {
	&printBlankForm();
	&printEndHtml();
	exit;
    }
    else # User is attempting to upload data file
    {
	# Slurp file into memory
	$alndata .= $_ while (<$datafile>);
    }
}
&read_alignment_data(\$alndata);

my $SET             = {};
my $SCORE           = {};

$SET->{'G'}           = ['G', [ 'G' ]];
$SET->{'A'}           = ['A', [ 'A' ]];
$SET->{'I'}           = ['I', [ 'I' ]];
$SET->{'V'}           = ['V', [ 'V' ]];
$SET->{'L'}           = ['L', [ 'L' ]];
$SET->{'M'}           = ['M', [ 'M' ]];
$SET->{'F'}           = ['F', [ 'F' ]];
$SET->{'Y'}           = ['Y', [ 'Y' ]];
$SET->{'W'}           = ['W', [ 'W' ]];
$SET->{'H'}           = ['H', [ 'H' ]];
$SET->{'C'}           = ['C', [ 'C' ]];
$SET->{'P'}           = ['P', [ 'P' ]];
$SET->{'K'}           = ['K', [ 'K' ]];
$SET->{'R'}           = ['R', [ 'R' ]];
$SET->{'D'}           = ['D', [ 'D' ]];
$SET->{'E'}           = ['E', [ 'E' ]];
$SET->{'Q'}           = ['Q', [ 'Q' ]];
$SET->{'N'}           = ['N', [ 'N' ]];
$SET->{'S'}           = ['S', [ 'S' ]];
$SET->{'T'}           = ['T', [ 'T' ]];
                      
$SET->{aromatic}    = ['a', [ 'F', 'Y','W', 'H' ]];
$SET->{aliphatic}   = ['l', [ 'I', 'V', 'L' ]];
$SET->{hydrophobic} = ['h', [ @{$SET->{aliphatic}->[1]},
                              @{$SET->{aromatic}->[1]},
                              'A', 'G', 'M', 'C','K', 'R', 'T' ]];
                      
$SET->{positive}    = ['+', [ 'H', 'K', 'R' ]];
$SET->{negative}    = ['-', [ 'D', 'E' ]];
$SET->{charged}     = ['c', [ @{$SET->{positive}->[1]}, 
                              @{$SET->{negative}->[1]} ]];
                      
$SET->{polar}       = ['p', [ @{$SET->{charged}->[1]}, 'Q', 'N', 'S', 'T', 'C' ]];
$SET->{alcohol}     = ['o', [ 'S', 'T' ]];
                      
$SET->{tiny}        = ['u', [ 'G', 'A', 'S' ]];
$SET->{small}       = ['s', [ @{$SET->{tiny}->[1]}, 'V', 'T', 'D','N', 'P', 'C' ]];
$SET->{turnlike}    = ['t', [ @{$SET->{tiny}->[1]}, @{$SET->{polar}->[1]} ]];

$SET->{any}         = ['.', [ 'G','A','V','I','L','M','F','Y','W','H','C','P','K','R','D','E','Q','N','S','T' ]];

print <<'HTML';
<span style="color: green; font-size: 12pt;">Please wait... 
HTML
foreach my $threshold (reverse sort @THRESHOLD) 
{
    compute_consensus($threshold);
}
print <<'HTML';
Complete.</span>
<div style="font-size: 9pt;">
<pre>
HTML
foreach my $threshold (reverse sort @THRESHOLD) 
{
    my $format = sprintf "consensus/%d%%", $threshold;
    $format .= ' 'x($g_LongestID - length($format));
    printf "%s   %s\n", $format, $CONCENSUS{$threshold};
}
print "\n";
foreach my $id (@ID)
{
    my $tmp_id = $id . ' 'x($g_LongestID - length($id));
    printf "%s   %s\n",          $tmp_id, join("", @{$ALIGNMENT{$id}});
}
print "\n";
foreach my $threshold (reverse sort @THRESHOLD) 
{
    my $format = sprintf "consensus/%d%%", $threshold;
    $format .= ' 'x($g_LongestID - length($format));
    printf "%s   %s\n", $format, $CONCENSUS{$threshold};
}
print qq(<a name="bottom"></a></pre></div>\n);
&printEndHtml();

sub class {
    my ($ref) = @_;
    if ($ref->[0]) {
        return $ref->[0];
    }
    return "?";
}
sub residues {
    my ($ref) = @_;
    if ($ref->[1]) {
        return \@{$ref->[1]};
    }
    return 0;
}

sub read_alignment_data {
    my ($data) = shift;
    my ($id, $line);

    while ($$data =~ /(.*)/og) {
	$line = $1;
        next    if $line =~ /^CLUSTAL/;

	# Windows compatability - remove those swine carriage returns
	$line =~ s/\r//g;

        if ($line =~ /^([^      ]+)\s+([-a-zA-Z*.]+)\s*$/o) {
#        if ($line =~ /^(\S+)\s+([-a-zA-Z*.]+)\s*$/o) {
            if (!$ALIGNMENT{$1}) {
                #new sequence identifier
                push @ID, $1;

		$g_LongestID = length($1) if (length ($1) > $g_LongestID);
            }
            #strip spaces,tabs,newlines: extend alignment array
            $line = $2;
            $line =~ tr/ \t\n//d;
            push @{$ALIGNMENT{$1}}, split("", $line);
        }
    }

    $LENGTH = check_lengths();
}

#check the sequence lengths and return alignment length
sub check_lengths {
    my ($id, $l);
    my $len = scalar(@{ $ALIGNMENT{$ID[0]} }); 
    foreach $id (@ID) {
        if (($l = @{ $ALIGNMENT{$id} }) != $len) {
            print qq(ERROR! sequence length differs for id: '$id' ($l)\n);
	    die;
        }
    }
    return $len;
}

sub member {
    my ($pattern, $list) = @_;
    my $i;
    foreach $i (@$list) {
        return 1    if $i eq $pattern;
    }
    return 0;
}

sub compute_consensus {
    my ($threshold) = @_;
    my ($id, $column) = ("", []);

    for (my $c = 0; $c < $LENGTH; $c++) {
        $column = [];
        foreach $id (@ID) {
            if (${$ALIGNMENT{$id}}[$c] ne '-' and
                ${$ALIGNMENT{$id}}[$c] ne '.') {
                push @$column, ${$ALIGNMENT{$id}}[$c];
            }
        }
        if (@$column) {
            tally_column($column);
            #        print_long($c);
            arbitrate($threshold);
        } else {
            $CONCENSUS{$threshold} .= ' ';
        }
    }
}
    
sub tally_column {
    my ($column) = @_;
    my ($class, $aa);

    #zero column score votes by class
    foreach $class (keys %$SET) {
        $SCORE->{$class} = 0;
    }

    #tally scores by class
    foreach $class (keys %$SET) {
        foreach $aa (@$column) {
            if (member($aa, residues($SET->{$class}))) {
                $SCORE->{$class}++;
            }
        }
        $SCORE->{$class} = 100.0 * $SCORE->{$class} / @ID;
    }
}

sub arbitrate {
    my ($threshold) = @_;
    my ($class, $bestclass, $bestscore) = ("", 'any', 0);

    #choose smallest class exceeding threshold and
    #highest percent when same size
    foreach $class (keys %$SET) {

        if ($SCORE->{$class} >= $threshold) {

            #this set is worth considering further
            if (@{residues($SET->{$class})} < @{residues($SET->{$bestclass})}) {

                #new set is smaller: keep it
                $bestclass = $class;
                $bestscore = $SCORE->{$class};

            } elsif (@{residues($SET->{$class})} == @{residues($SET->{$bestclass})}) {

                #sets are same size: look at score instead
                if ($SCORE->{$class} > $bestscore) {

                    #new set has better score
                    $bestclass = $class;
                    $bestscore = $SCORE->{$class};
                }
                
            }
        }
    }
    if ($bestclass) {
        $CONCENSUS{$threshold} .= $SET->{$bestclass}[0];
    } else {
        $CONCENSUS{$threshold} .= $SET->{any}[0];       
    }
}

sub print_long {
    my ($c) = @_;
    my $class;
    print ${$ALIGNMENT{$ID[0]}}[$c];
    foreach $class (sort keys %$SET) {
        printf " %s=%5.1f", class($SET->{$class}), $SCORE->{$class};
    }
    print "\n";
}

sub print_sets {
    my ($class, $res);
    printf STDERR "    %-15s %-3s  %s\n", 'class', 'key', 'residues';
    foreach $class (sort keys %$SET) {
        printf STDERR "    %-15s %-3s  ", $class, $SET->{$class}[0];
        print STDERR join(",", sort @{$SET->{$class}[1]}), "\n";
    }
}

sub printBeginHtml
{
    print <<'HTML';
<html>
<head>
<title>Conensus</title>
<link rel="stylesheet" type="text/css" href="/styles/global.css" />
<link rel="stylesheet" type="text/css" href="/styles/consensus.css" />
</head>
<body>

<h3><a href="/cgi-bin/consensus.cgi" style="color: white; text-decoration: none;">Consensus</a></h3>
HTML
}

sub printEndHtml
{
    print <<'HTML';
</body>
</html>
HTML
}

sub printBlankForm 
{
    print <<'HTML';
<div class="container">
<form method="POST" enctype="multipart/form-data">
<table>
<tr>
    <td colspan="2"><label for="datafile">Upload Clustal File: &nbsp;</label><input id="datafile" name="datafile" type="file" size="40" /></td>
</tr>
<tr>
    <td colspan="2"><span style="font-weight: bold; font-style: italic;">OR</span>&nbsp; <label for="alndata">Input clustal alignment data below:</label></td>
</tr>
<tr>
    <td colspan="2"><textarea id="alndata" name="alndata" cols="70" rows="15"></textarea></td>
</tr>
<tr>
    <td><input id="Reset" name="Reset" type="reset" value="Reset" /></td>
    <td style="text-align: right;"><input id="Submit" name="Submit" type="submit" value="Consensus" /></td>
</tr>
<tr>
    <td colspan="2" style="text-align: center;">Consensus Thresholds:</td>
</tr>
<tr>
    <td colspan="2" style="text-align: center;">
    <input id="50" name="threshold" type="checkbox" value="50" checked /><label for="50"> 50&nbsp;</label>
    <input id="55" name="threshold" type="checkbox" value="55" /><label for="55"> 55&nbsp;</label>
    <input id="60" name="threshold" type="checkbox" value="60" checked /><label for="60"> 60&nbsp;</label>
    <input id="65" name="threshold" type="checkbox" value="65" /><label for="65"> 65&nbsp;</label>
    <input id="70" name="threshold" type="checkbox" value="70" checked /><label for="70"> 70&nbsp;</label>
    <input id="75" name="threshold" type="checkbox" value="75" /><label for="75"> 75&nbsp;</label>
    <input id="80" name="threshold" type="checkbox" value="80" checked /><label for="80"> 80&nbsp;</label>
    <input id="85" name="threshold" type="checkbox" value="85" /><label for="85"> 85&nbsp;</label>
    <input id="90" name="threshold" type="checkbox" value="90" checked /><label for="90"> 90&nbsp;</label>
    <input id="95" name="threshold" type="checkbox" value="95" /><label for="95"> 95&nbsp;</label>
    </td>
</tr>

</table>
</form>
</div>
HTML
}

sub validateParameter
{
    my ($name, $required, $regex) = @_;

    my $tmp = param($name);
    if (!defined($tmp) or $tmp eq '')
    {
	if ($required)
	{
	    print qq(<span style="color: red;">Missing Required Data</span>\n);
	    &printEndHtml();
	    exit;
	}
	return undef;
    }
    if ($tmp !~ m/$regex/)
    {
	if ($required)
	{
	    print qq(<span style="color: red;">Missing Required Data</span>\n);
	    &printEndHtml();
	    exit;
	}
	return undef;
    }

    # $1 should be defined in parens of the regex
    return $1;
}
