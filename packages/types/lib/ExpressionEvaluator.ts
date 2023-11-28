import type { IAction } from '@comunica/core';
import type * as E from '@comunica/expression-evaluator/lib/expressions';
import type { SuperTypeCallback } from '@comunica/expression-evaluator/lib/util/TypeHandling';
import type * as RDF from '@rdfjs/types';

import type { Algebra as Alg } from 'sparqlalgebrajs';
import type { IActionContext } from './IActionContext';

/**
 * Instances of this interface perform a specific aggregation of bindings.
 * You can put bindings and when all bindings have been put, request the result.
 */
export interface IBindingsAggregator {
  /**
   * Registers bindings to the aggregator. Each binding you put has the ability to change the aggregation result.
   * @param bindings the bindings to put.
   */
  putBindings: (bindings: RDF.Bindings) => Promise<void>;

  /**
   * Request the result term of aggregating the bindings you have put in the aggregator.
   */
  result: () => Promise<RDF.Term | undefined>;
}

/**
 * A factory able to create objects for handling expressions.
 */
export interface IExpressionEvaluatorFactory {
  /**
   * Create an Expression Evaluator given an expression and the action context,
   * additional configs will be extracted from the context.
   * @param algExpr The SPARQL expression.
   * @param context the actionContext to extract engine config settings from.
   */
  createEvaluator: (algExpr: Alg.Expression, context: IActionContext) => Promise<IExpressionEvaluator>;

  /**
   * Creates a bindings aggregator given an expression and the action context,
   * additional configs will be extracted from the context.
   * @param algExpr The SPARQL expression.
   * @param context the actionContext to extract engine config settings from.
   */
  createAggregator: (algExpr: Alg.AggregateExpression, context: IActionContext) => Promise<IBindingsAggregator>;

  createTermComparator: (orderAction: ITermComparatorBusActionContext) => Promise<IOrderByEvaluator>;

  createFunction: FunctionBusType;
}

export interface IInternalEvaluator {
  internalEvaluation: (expr: E.Expression, mapping: RDF.Bindings) => Promise<E.Term>;

  context: IActionContext;
}

/**
 * An evaluator for RDF expressions.
 */
export interface IExpressionEvaluator extends IInternalEvaluator {
  /**
   * Evaluates the provided bindings in terms of the context the evaluator was created.
   * @param mapping the RDF bindings to evaluate against.
   */
  evaluate: (mapping: RDF.Bindings) => Promise<RDF.Term>;

  /**
   * Evaluates the provided bindings in terms of the context the evaluator was created,
   * returning the effective boolean value.
   * @param mapping the RDF bindings to evaluate against.
   */
  evaluateAsEBV: (mapping: RDF.Bindings) => Promise<boolean>;

  evaluateAsInternal: (mapping: RDF.Bindings) => Promise<E.Expression>;
}

export interface IOrderByEvaluator {
  /**
   * Orders two RDF terms according to: https://www.w3.org/TR/sparql11-query/#modOrderBy
   * @param termA the first term
   * @param termB the second term
   */
  orderTypes: (termA: RDF.Term | undefined, termB: RDF.Term | undefined) => -1 | 0 | 1;
}

export interface IEvalContext {
  args: E.Expression[];
  mapping: RDF.Bindings;
  exprEval: IInternalEvaluator;
}

export type FunctionApplication = (evalContext: IEvalContext) => Promise<E.TermExpression>;

export interface IExpressionFunction {
  apply: (evalContext: IEvalContext) => Promise<E.TermExpression>;
  /**
   * Makes you able to error in the termTransformer.
   */
  checkArity: (args: E.Expression[]) => boolean;
}

export interface ITermFunction extends IExpressionFunction{
  supportsTermExpressions: true;
  applyOnTerms: (args: E.TermExpression[], exprEval: IInternalEvaluator) => E.TermExpression;
}

export interface IFunctionBusActionContext {
  functionName: string;
  arguments?: Alg.Expression[];
  requireTermExpression?: boolean;
}

export type FunctionBusType = <T extends IFunctionBusActionContext>(arg: T & IAction) =>
Promise<T extends { requireTermExpression: true } ? ITermFunction : IExpressionFunction>;

export interface ITermComparatorBusActionContext extends IAction{
  getSuperType?: SuperTypeCallback;
}
export type TermComparatorBus = (arg: ITermComparatorBusActionContext) => Promise<IOrderByEvaluator>;
