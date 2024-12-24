import type { Bindings } from '@comunica/types';
import type { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import type { Variable } from 'rdf-data-factory';
import { termToString } from 'rdf-string';
import { mapTermsNested, someTermsNested } from 'rdf-terms';
import type { Factory } from 'sparqlalgebrajs';
import { Algebra, Util } from 'sparqlalgebrajs';

/**
 * Materialize a term with the given binding.
 *
 * If the given term is a variable,
 * and that variable exist in the given bindings object,
 * the value of that binding is returned.
 * In all other cases, the term itself is returned.
 *
 * @param {RDF.Term} term A term.
 * @param {Bindings} bindings A bindings object.
 * @return {RDF.Term} The materialized term.
 */
export function materializeTerm(term: RDF.Term, bindings: Bindings): RDF.Term {
  if (term.termType === 'Variable') {
    const value = bindings.get(term);
    if (value) {
      return value;
    }
  }
  if (term.termType === 'Quad' && someTermsNested(term, value => value.termType === 'Variable')) {
    return mapTermsNested(term, subTerm => materializeTerm(subTerm, bindings));
  }
  return term;
}

/**
 * Materialize the given operation (recursively) with the given bindings.
 * Essentially, the variables in the given operation
 * which don't appear in the projection operation will be replaced
 * by the terms bound to the variables in the given bindings.
 * @param {Algebra.Operation} operation SPARQL algebra operation.
 * And the variables that appear in the projection operation
 * will be added to a new values operation.
 * @param {Bindings} bindings A bindings object.
 * @param algebraFactory The algebra factory.
 * @param bindingsFactory The bindings factory.
 * @param options Options for materializations.
 * @param options.strictTargetVariables If target variable bindings (such as on SELECT or BIND) should not be allowed.
 * @param options.bindFilter If filter expressions should be materialized.
 * @param options.originalBindings The bindings object as it was at the top level call of materializeOperation.
 * @return Algebra.Operation A new operation materialized with the given bindings.
 */
export function materializeOperation(
  operation: Algebra.Operation,
  bindings: Bindings,
  algebraFactory: Factory,
  bindingsFactory: BindingsFactory,
  options: {
    strictTargetVariables?: boolean;
    bindFilter?: boolean;
    originalBindings?: Bindings;
  } = {},
): Algebra.Operation {
  options = {
    strictTargetVariables: 'strictTargetVariables' in options ? options.strictTargetVariables : false,
    bindFilter: 'bindFilter' in options ? options.bindFilter : true,
    originalBindings: 'originalBindings' in options ? options.originalBindings : bindings,
  };

  return Util.mapOperation(operation, {
    path(op: Algebra.Path, factory: Factory) {
      // Materialize variables in a path expression.
      // The predicate expression will be recursed.
      return {
        recurse: false,
        result: Object.assign(factory.createPath(
          materializeTerm(op.subject, bindings),
          op.predicate,
          materializeTerm(op.object, bindings),
          materializeTerm(op.graph, bindings),
        ), { metadata: op.metadata }),
      };
    },
    pattern(op: Algebra.Pattern, factory: Factory) {
      // Materialize variables in the quad pattern.
      return {
        recurse: false,
        result: Object.assign(factory.createPattern(
          materializeTerm(op.subject, bindings),
          materializeTerm(op.predicate, bindings),
          materializeTerm(op.object, bindings),
          materializeTerm(op.graph, bindings),
        ), { metadata: op.metadata }),
      };
    },
    extend(op: Algebra.Extend, factory: Factory) {
      // Materialize an extend operation.
      // If strictTargetVariables is true, we throw if the extension target variable is attempted to be bound.
      // Otherwise, we remove the extend operation.
      if (bindings.has(op.variable)) {
        if (options.strictTargetVariables) {
          throw new Error(`Tried to bind variable ${termToString(op.variable)} in a BIND operator.`);
        } else {
          return {
            recurse: true,
            result: materializeOperation(op.input, bindings, algebraFactory, bindingsFactory, options),
          };
        }
      }
      let recursionResult: Algebra.Operation = materializeOperation(
        op.input,
        bindings,
        algebraFactory,
        bindingsFactory,
        options,
      );

      // Join op.input with a values clause containing the variables that are in InitialBindings and
      // are used in the current extend operation.
      const inScopeVariables = [ op.variable ];
      if (op.expression.expressionType === Algebra.expressionTypes.TERM && op.expression.term.termType === 'Variable') {
        inScopeVariables.push(op.expression.term);
      }
      const values: Algebra.Operation =
        createValuesFromBindings(factory, <Bindings> options.originalBindings, inScopeVariables);
      if (values.bindings.length > 0) {
        recursionResult = factory.createJoin([ values, recursionResult ]);
      }
      return {
        recurse: false,
        result: factory.createExtend(recursionResult, op.variable, <Algebra.Expression>
          materializeOperation(op.expression, bindings, algebraFactory, bindingsFactory, options)),
      };
    },
    group(op: Algebra.Group, factory: Factory) {
      // Materialize a group operation.
      // If strictTargetVariables is true, we throw if the group target variable is attempted to be bound.
      // Otherwise, we just filter out the bound variables.
      if (options.strictTargetVariables) {
        for (const variable of op.variables) {
          if (bindings.has(variable)) {
            throw new Error(`Tried to bind variable ${termToString(variable)} in a GROUP BY operator.`);
          }
        }
        return {
          recurse: true,
          result: op,
        };
      }
      const variables = op.variables.filter(variable => !bindings.has(variable));
      return {
        recurse: true,
        result: factory.createGroup(
          op.input,
          variables,
          op.aggregates,
        ),
      };
    },
    filter(op: Algebra.Filter, factory: Factory) {
      const originalBindings: Bindings = <Bindings> options.originalBindings;
      if (op.expression.expressionType !== 'operator' || originalBindings.size === 0) {
        return {
          recurse: false,
          result: op,
        };
      }

      // Make a values clause using all the variables from originalBindings.
      const values: Algebra.Operation = createValuesFromBindings(factory, originalBindings);

      // Recursively materialize the filter expression
      const recursionResultExpression: Algebra.Expression = <Algebra.Expression> materializeOperation(
        op.expression,
        bindings,
        algebraFactory,
        bindingsFactory,
        options,
      );

      // Recursively materialize the filter input
      let recursionResultInput: Algebra.Operation = materializeOperation(
        op.input,
        bindings,
        algebraFactory,
        bindingsFactory,
        options,
      );

      if (values.bindings.length > 0) {
        recursionResultInput = factory.createJoin([ values, recursionResultInput ]);
      }

      return {
        // Recursion already taken care of above.
        recurse: false,
        result: factory.createFilter(recursionResultInput, recursionResultExpression),
      };
    },
    project(op: Algebra.Project, factory: Factory) {
      // Materialize a project operation.
      // If strictTargetVariables is true, we throw if the project target variable is attempted to be bound.
      // Otherwise, we make a values clause out of the target variable and its value in InitialBindings.
      if (options.strictTargetVariables) {
        for (const variable of op.variables) {
          if (bindings.has(variable)) {
            throw new Error(`Tried to bind variable ${termToString(variable)} in a SELECT operator.`);
          }
        }
        return {
          recurse: true,
          result: op,
        };
      }

      // Only include non-projected variables in the bindings that will be passed down recursively.
      // This will result in non-projected variables being replaced with their InitialBindings values.
      for (const bindingKey of bindings.keys()) {
        for (const curVariable of op.variables) {
          if (curVariable.equals(bindingKey)) {
            bindings = bindings.delete(bindingKey);
            break;
          }
        }
      }

      // Find projected variables which are present in the originalBindings.
      // This will result in projected variables being handled via a values clause.
      const values: Algebra.Operation =
      createValuesFromBindings(factory, <Bindings> options.originalBindings, op.variables);

      let recursionResult: Algebra.Operation = materializeOperation(
        op.input,
        bindings,
        algebraFactory,
        bindingsFactory,
        options,
      );

      if (values.bindings.length > 0) {
        recursionResult = factory.createJoin([ values, recursionResult ]);
      }

      return {
        recurse: false,
        result: factory.createProject(recursionResult, op.variables),
      };
    },
    values(op: Algebra.Values, factory: Factory) {
      // Materialize a values operation.
      // If strictTargetVariables is true, we throw if the values target variable is attempted to be bound.
      // Otherwise, we just filter out the bound variables and their bindings.
      if (options.strictTargetVariables) {
        for (const variable of op.variables) {
          if (bindings.has(variable)) {
            throw new Error(`Tried to bind variable ${termToString(variable)} in a VALUES operator.`);
          }
        }
      } else {
        const variables = op.variables.filter(variable => !bindings.has(variable));
        const valueBindings: Record<string, RDF.Literal | RDF.NamedNode>[] = <any> op.bindings.map((binding) => {
          const newBinding = { ...binding };
          let valid = true;
          // eslint-disable-next-line unicorn/no-array-for-each
          bindings.forEach((value: RDF.Term, key: RDF.Variable) => {
            const keyString = termToString(key);
            if (keyString in newBinding) {
              if (!value.equals(newBinding[keyString])) {
                // If the value of the binding is not equal, remove this binding completely from the VALUES clause
                valid = false;
              }
              delete newBinding[keyString];
            }
          });
          return valid ? newBinding : undefined;
        }).filter(Boolean);
        return {
          recurse: true,
          result: factory.createValues(
            variables,
            valueBindings,
          ),
        };
      }
      return {
        recurse: false,
        result: op,
      };
    },
    expression(op: Algebra.Expression, factory: Factory) {
      if (!options.bindFilter) {
        return {
          recurse: false,
          result: op,
        };
      }

      if (op.expressionType === 'term') {
        // Materialize a term expression
        return {
          recurse: false,
          result: factory.createTermExpression(materializeTerm(op.term, bindings)),
        };
      }
      if (op.expressionType === 'operator') {
        if (op.operator === 'bound' && op.args.length === 1 && op.args[0].expressionType === 'term' &&
          [ ...bindings.keys() ].some(variable => op.args[0].term.equals(variable))) {
          return {
            recurse: false,
            result: factory.createTermExpression(factory.dataFactory.literal(
              'true',
              factory.dataFactory.namedNode('http://www.w3.org/2001/XMLSchema#boolean'),
            )),
          };
        }
        return {
          recurse: true,
          result: op,
        };
      }
      if (op.expressionType === 'aggregate' &&
        'variable' in op &&
        bindings.has(<RDF.Variable> op.variable)) {
        // Materialize a bound aggregate operation.
        // If strictTargetVariables is true, we throw if the expression target variable is attempted to be bound.
        // Otherwise, we ignore this operation.
        if (options.strictTargetVariables) {
          throw new Error(`Tried to bind ${termToString(op.variable)} in a ${op.aggregator} aggregate.`);
        } else {
          return {
            recurse: true,
            result: op,
          };
        }
      }
      return {
        recurse: true,
        result: op,
      };
    },
  }, algebraFactory);
}

/**
 * Make a values operation containing the values that are present in `bindings` for variables present in `variables`.
 * If no `variables` argument is given, this method returns a values operation
 * containing every binding from `bindings`.
 * @param {Factory} factory The Factory used to create the values operation.
 * @param {Bindings} bindings A bindings object.
 * @param {Variable[]} variables A list of variables.
 * @returns Algebra.Values A new values operation the given bindings.
 */
function createValuesFromBindings(factory: Factory, bindings: Bindings, variables?: Variable[]): Algebra.Values {
  const filteredVariables = variables ? variables.filter(variable => bindings.has(variable)) : [ ...bindings.keys() ];
  if (filteredVariables.length === 0) {
    return factory.createValues([], []);
  }
  const bindingRecord: Record<string, RDF.Literal | RDF.NamedNode> = {};
  for (const variable of filteredVariables) {
    bindingRecord[termToString(variable)] = <RDF.Literal | RDF.NamedNode> bindings.get(variable)!;
  }
  return factory.createValues(filteredVariables, [ bindingRecord ]);
}
