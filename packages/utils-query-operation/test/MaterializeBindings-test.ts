import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import { materializeOperation, materializeTerm } from '../lib/MaterializeBindings';

const DF = new DataFactory();
const AF = new Factory();
const BF = new BindingsFactory(DF);

const termNamedNode = DF.namedNode('a');
const termLiteral = DF.literal('b');
const termVariableA = DF.variable('a');
const termVariableB = DF.variable('b');
const termVariableC = DF.blankNode('c');
const termVariableD = DF.variable('d');
const termDefaultGraph = DF.defaultGraph();

const valueA = DF.literal('A');
const valueB = DF.literal('B');
const valueC = DF.literal('C');

const bindingsEmpty = BF.bindings();
const bindingsA = BF.bindings([
  [ DF.variable('a'), DF.literal('A') ],
]);
const bindingsC = BF.bindings([
  [ DF.variable('c'), DF.literal('C') ],
]);
const bindingsAC = BF.bindings([
  [ DF.variable('a'), valueA ],
  [ DF.variable('c'), valueC ],
]);
const bindingsAB = BF.bindings([
  [ DF.variable('a'), valueA ],
  [ DF.variable('b'), valueB ],
]);

const valuesBindingsA: Record<string, RDF.Literal | RDF.NamedNode> = {};
valuesBindingsA[`?${termVariableA.value}`] = <RDF.Literal> bindingsA.get(termVariableA);
const valuesBindingsB: Record<string, RDF.Literal | RDF.NamedNode> = {};
valuesBindingsB[`?${termVariableB.value}`] = <RDF.Literal> bindingsAB.get(termVariableB);

describe('materializeTerm', () => {
  it('should not materialize a named node with empty bindings', () => {
    expect(materializeTerm(termNamedNode, bindingsEmpty))
      .toEqual(termNamedNode);
  });

  it('should not materialize a named node with bindings for a', () => {
    expect(materializeTerm(termNamedNode, bindingsA))
      .toEqual(termNamedNode);
  });

  it('should not materialize a named node with bindings for c', () => {
    expect(materializeTerm(termNamedNode, bindingsC))
      .toEqual(termNamedNode);
  });

  it('should not materialize a named node with bindings for a and c', () => {
    expect(materializeTerm(termNamedNode, bindingsAC))
      .toEqual(termNamedNode);
  });

  it('should not materialize a literal with empty bindings', () => {
    expect(materializeTerm(termLiteral, bindingsEmpty))
      .toEqual(termLiteral);
  });

  it('should not materialize a literal with bindings for a', () => {
    expect(materializeTerm(termLiteral, bindingsA))
      .toEqual(termLiteral);
  });

  it('should not materialize a literal with bindings for c', () => {
    expect(materializeTerm(termLiteral, bindingsC))
      .toEqual(termLiteral);
  });

  it('should not materialize a literal with bindings for a and c', () => {
    expect(materializeTerm(termLiteral, bindingsAC))
      .toEqual(termLiteral);
  });

  it('should not materialize a variable with empty bindings', () => {
    expect(materializeTerm(termVariableC, bindingsEmpty))
      .toEqual(termVariableC);
  });

  it('should not materialize a variable with bindings for a', () => {
    expect(materializeTerm(termVariableC, bindingsA))
      .toEqual(termVariableC);
  });

  it('should not materialize a blank node with bindings for c', () => {
    expect(materializeTerm(termVariableC, bindingsC))
      .toEqual(termVariableC);
  });

  it('should not materialize a blank node with bindings for a and c', () => {
    expect(materializeTerm(termVariableC, bindingsAC))
      .toEqual(termVariableC);
  });

  it('should not materialize a default graph with empty bindings', () => {
    expect(materializeTerm(termDefaultGraph, bindingsEmpty))
      .toEqual(termDefaultGraph);
  });

  it('should not materialize a default graph with bindings for a', () => {
    expect(materializeTerm(termDefaultGraph, bindingsA))
      .toEqual(termDefaultGraph);
  });

  it('should not materialize a default graph with bindings for c', () => {
    expect(materializeTerm(termDefaultGraph, bindingsC))
      .toEqual(termDefaultGraph);
  });

  it('should not materialize a default graph with bindings for a and c', () => {
    expect(materializeTerm(termDefaultGraph, bindingsAC))
      .toEqual(termDefaultGraph);
  });

  it('should not materialize a quoted triple without variables', () => {
    expect(materializeTerm(DF.quad(
      termNamedNode,
      termNamedNode,
      termNamedNode,
    ), bindingsAC))
      .toEqual(DF.quad(
        termNamedNode,
        termNamedNode,
        termNamedNode,
      ));
  });

  it('should materialize a quoted triple with variables', () => {
    expect(materializeTerm(DF.quad(
      termVariableA,
      termNamedNode,
      termVariableB,
    ), bindingsAB))
      .toEqual(DF.quad(
        <any> valueA,
        termNamedNode,
        valueB,
      ));
  });

  it('should materialize a nested quoted triple with variables', () => {
    expect(materializeTerm(DF.quad(
      termVariableA,
      termNamedNode,
      DF.quad(
        termVariableA,
        termNamedNode,
        termVariableB,
      ),
    ), bindingsAB))
      .toEqual(DF.quad(
        <any> valueA,
        termNamedNode,
        DF.quad(
          <any> valueA,
          termNamedNode,
          valueB,
        ),
      ));
  });
});

describe('materializeOperation', () => {
  it('should materialize a quad pattern with empty bindings', () => {
    expect(materializeOperation(
      AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
      bindingsEmpty,
      AF,
      BF,
    ))
      .toEqual(AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode));
  });

  it('should materialize a quad pattern with non-empty bindings', () => {
    expect(materializeOperation(
      AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode));
  });

  it('should materialize a quad pattern with non-empty bindings and keep metadata', () => {
    const metadata = { a: 'b' };
    expect(materializeOperation(
      Object.assign(AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode), { metadata }),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(Object.assign(AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode), { metadata }));
  });

  it('should materialize a BGP with non-empty bindings', () => {
    expect(materializeOperation(
      AF.createBgp([
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
      ]),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createBgp([
        AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
      ]));
  });

  it('should materialize a path expression with non-empty bindings', () => {
    expect(materializeOperation(
      AF.createPath(termVariableA, <any> null, termVariableC, termNamedNode),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createPath(valueA, <any> null, termVariableC, termNamedNode));
  });

  it('should materialize a path expression with non-empty bindings and keep metadata', () => {
    const metadata = { a: 'b' };
    expect(materializeOperation(
      Object.assign(AF.createPath(termVariableA, <any> null, termVariableC, termNamedNode), { metadata }),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(Object.assign(AF.createPath(valueA, <any> null, termVariableC, termNamedNode), { metadata }));
  });

  it('should materialize a nested path expression with non-empty bindings', () => {
    expect(materializeOperation(
      AF.createPath(
        termVariableA,
        AF.createAlt([
          AF.createNps([ DF.namedNode('A') ]),
          AF.createNps([ DF.namedNode('B') ]),
        ]),
        termVariableC,
        termNamedNode,
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createPath(
        valueA,
        AF.createAlt([
          AF.createNps([ DF.namedNode('A') ]),
          AF.createNps([ DF.namedNode('B') ]),
        ]),
        termVariableC,
        termNamedNode,
      ));
  });

  it('should not modify an extend operation without matching variables', () => {
    expect(materializeOperation(
      AF.createExtend(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        termVariableB,
        AF.createTermExpression(termVariableB),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createExtend(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        termVariableB,
        AF.createTermExpression(termVariableB),
      ));
  });

  it('should modify an extend operation with matching variables', () => {
    expect(materializeOperation(
      AF.createExtend(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        termVariableB,
        AF.createTermExpression(termVariableA),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createExtend(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        ]),
        termVariableB,
        AF.createTermExpression(valueA),
      ));
  });

  it('should error on an extend operation with ' +
    'a binding variable equal to the target variable for strictTargetVariables', () => {
    expect(() => materializeOperation(
      AF.createExtend(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        termVariableA,
        AF.createTermExpression(termVariableA),
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    )).toThrow(new Error('Tried to bind variable ?a in a BIND operator.'));
  });

  it('should modify an extend operation with binding variable equal to the target variable', () => {
    expect(materializeOperation(
      AF.createExtend(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        termVariableA,
        AF.createTermExpression(termVariableC),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode));
  });

  it('should not modify a group operation without matching variables', () => {
    expect(materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(termVariableB),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createGroup(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(termVariableB),
          true,
        ) ],
      ));
  });

  it('should modify a group operation with matching variables', () => {
    expect(materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(termVariableA),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createGroup(
        AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(valueA),
          true,
        ) ],
      ));
  });

  it('should error on a group operation with ' +
    'a binding variable equal to the target variable for strictTargetVariables', () => {
    expect(() => materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableA, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(termVariableA),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    )).toThrow(new Error('Tried to bind variable ?a in a GROUP BY operator.'));
  });

  it('should modify a group operation with a binding variable equal to the target variable', () => {
    expect(materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableA, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(termVariableA),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createGroup(
        AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableD ],
        [ AF.createBoundAggregate(
          termVariableB,
          'SUM',
          AF.createTermExpression(valueA),
          true,
        ) ],
      ));
  });

  it('should error on a group operation with ' +
    'a binding variable equal to the bound aggregate variable for strictTargetVariables', () => {
    expect(() => materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableA,
          'SUM',
          AF.createTermExpression(termVariableA),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    )).toThrow(new Error('Tried to bind ?a in a SUM aggregate.'));
  });

  it('should modify a group operation with aa binding variable equal to the bound aggregate variable', () => {
    expect(materializeOperation(
      AF.createGroup(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableA,
          'SUM',
          AF.createTermExpression(termVariableA),
          true,
        ) ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createGroup(
        AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
        [ AF.createBoundAggregate(
          termVariableA,
          'SUM',
          AF.createTermExpression(valueA),
          true,
        ) ],
      ));
  });

  it('should not modify a project operation without matching variables', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createProject(
        AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
      ));
  });

  it('should modify a project operation with matching variables', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableA, termVariableB, termVariableD ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createProject(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        ]),
        [ termVariableA, termVariableB, termVariableD ],
      ));
  });

  it('should modify a project operation with matching variables for strictTargetVariables', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    ))
      .toEqual(AF.createProject(
        AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableB, termVariableD ],
      ));
  });

  it('should error on a project operation with ' +
    'a binding variable equal to the target variable for strictTargetVariables', () => {
    expect(() => materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableA, termVariableD ],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    )).toThrow(new Error('Tried to bind variable ?a in a SELECT operator.'));
  });

  it('should modify a project operation with a binding variable equal to the target variable', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        [ termVariableA, termVariableD ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createProject(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
        ]),
        [ termVariableA, termVariableD ],
      ));
  });

  it('should only modify variables in the project operation that are present in the projection range', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createPattern(termVariableA, termNamedNode, termVariableB, termNamedNode),
        [ termVariableD, termVariableB ],
      ),
      bindingsAB,
      AF,
      BF,
    ))
      .toEqual(AF.createProject(
        AF.createJoin([
          AF.createValues([ termVariableB ], [ valuesBindingsB ]),
          AF.createPattern(valueA, termNamedNode, termVariableB, termNamedNode),
        ]),
        [ termVariableD, termVariableB ],
      ));
  });

  it('should use the original InitialBindings in recursive calls with nested project expressions', () => {
    expect(materializeOperation(
      AF.createProject(
        AF.createProject(
          AF.createPattern(termVariableA, termNamedNode, termVariableB, termNamedNode),
          [ termVariableD, termVariableB ],
        ),
        [ termVariableD, termVariableB ],
      ),
      bindingsAB,
      AF,
      BF,
    ))
      .toEqual(AF.createProject(
        AF.createJoin([
          AF.createValues([ termVariableB ], [ valuesBindingsB ]),
          AF.createProject(
            AF.createJoin([
              AF.createValues([ termVariableB ], [ valuesBindingsB ]),
              AF.createPattern(valueA, termNamedNode, termVariableB, termNamedNode),
            ]),
            [ termVariableD, termVariableB ],
          ),
        ]),
        [ termVariableD, termVariableB ],
      ));
  });

  it('should not modify a values operation without matching variables', () => {
    expect(materializeOperation(
      AF.createValues(
        [ termVariableB, termVariableD ],
        [{ '?b': valueC }],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createValues(
        [ termVariableB, termVariableD ],
        [{ '?b': valueC }],
      ));
  });

  it('should not modify a values operation without matching variables for strictTargetVariables', () => {
    expect(materializeOperation(
      AF.createValues(
        [ termVariableB, termVariableD ],
        [{ '?b': valueC }],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    ))
      .toEqual(AF.createValues(
        [ termVariableB, termVariableD ],
        [{ '?b': valueC }],
      ));
  });

  it('should error on a values operation with ' +
    'a binding variable equal to the target variable for strictTargetVariables', () => {
    expect(() => materializeOperation(
      AF.createValues(
        [ termVariableA, termVariableD ],
        [{ '?a': valueC, '?d': valueC }],
      ),
      bindingsA,
      AF,
      BF,
      { strictTargetVariables: true },
    )).toThrow(new Error('Tried to bind variable ?a in a VALUES operator.'));
  });

  it('should modify a values operation with a binding variable equal to the target variable', () => {
    expect(materializeOperation(
      AF.createValues(
        [ termVariableA, termVariableD ],
        [{ '?a': valueA, '?d': valueC }],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createValues(
        [ termVariableD ],
        [{ '?d': valueC }],
      ));
  });

  it('should modify a values operation with a binding variable equal to the target variable, ' +
    'and a non-matching binding value', () => {
    expect(materializeOperation(
      AF.createValues(
        [ termVariableA, termVariableD ],
        [
          { '?a': valueA, '?d': valueC },
          { '?a': valueC, '?d': valueC },
        ],
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createValues(
        [ termVariableD ],
        [{ '?d': valueC }],
      ));
  });

  it('should not modify a filter expression without operator as expression', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createTermExpression(termNamedNode),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createTermExpression(termNamedNode),
      ));
  });

  it('should not modify a filter expression without matching variables', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableB),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableB),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should modify a filter expression with matching variables', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableA),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(valueA),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should modify a filter expression with BOUND with matching variables', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createOperatorExpression('bound', [ AF.createTermExpression(termVariableA) ]),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(DF.literal('true', DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean'))),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should modify a not filter expression with invalid BOUND argument count', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createOperatorExpression('bound', [
            AF.createTermExpression(termVariableA),
            AF.createTermExpression(termVariableA),
          ]),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createOperatorExpression('bound', [
            AF.createTermExpression(valueA),
            AF.createTermExpression(valueA),
          ]),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should modify a not filter expression with invalid BOUND argument type', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createOperatorExpression('bound', [
            AF.createOperatorExpression('a', [
              AF.createTermExpression(termVariableA),
            ]),
          ]),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createOperatorExpression('bound', [
            AF.createOperatorExpression('a', [
              AF.createTermExpression(valueA),
            ]),
          ]),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should not modify a filter expression with matching variables with bindFilter: false', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createBgp([
          AF.createPattern(termVariableA, termNamedNode, termVariableC, termNamedNode),
          AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableA),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
      { bindFilter: false },
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createBgp([
            AF.createPattern(valueA, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
        ]),

        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableA),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });

  it('should use the original InitialBindings in recursive calls with nested filter expressions', () => {
    expect(materializeOperation(
      AF.createFilter(
        AF.createFilter(
          AF.createBgp([
            AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
            AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
          ]),
          AF.createOperatorExpression('contains', [
            AF.createTermExpression(termVariableB),
            AF.createTermExpression(termVariableB),
          ]),
        ),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableB),
          AF.createTermExpression(termVariableB),
        ]),
      ),
      bindingsA,
      AF,
      BF,
    ))
      .toEqual(AF.createFilter(
        AF.createJoin([
          AF.createValues([ termVariableA ], [ valuesBindingsA ]),
          AF.createFilter(
            AF.createJoin([
              AF.createValues([ termVariableA ], [ valuesBindingsA ]),
              AF.createBgp([
                AF.createPattern(termVariableB, termNamedNode, termVariableC, termNamedNode),
                AF.createPattern(termNamedNode, termVariableB, termVariableC, termNamedNode),
              ]),
            ]),
            AF.createOperatorExpression('contains', [
              AF.createTermExpression(termVariableB),
              AF.createTermExpression(termVariableB),
            ]),
          ),
        ]),
        AF.createOperatorExpression('contains', [
          AF.createTermExpression(termVariableB),
          AF.createTermExpression(termVariableB),
        ]),
      ));
  });
});
