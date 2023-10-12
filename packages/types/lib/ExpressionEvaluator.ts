import type * as RDF from '@rdfjs/types';
import type { Algebra as Alg } from 'sparqlalgebrajs';
import type { IActionContext } from './IActionContext';

/**
 * Instances of this interface perform a specific aggregation of bindings.
 * You can put bindings and when all bindings have been put, request the result.
 */
export interface IBindingAggregator {
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
 * A factory able to create an expression evaluator and related types.
 * It can be used as a way to group mediators in a single class, ready for later use.
 */
export interface IExpressionEvaluatorFactory {
  /**
   * Create an Expression Evaluator given an expression and the action context,
   * additional configs will be extracted from the context.
   * @param algExpr The SPARQL expression.
   * @param context the actionContext to extract engine config settings from.
   */
  createEvaluator: (algExpr: Alg.Expression, context: IActionContext) => IExpressionEvaluator;

  /**
   * Creates a bindings aggregator given an expression and the action context,
   * additional configs will be extracted from the context.
   * @param algExpr The SPARQL expression.
   * @param context the actionContext to extract engine config settings from.
   */
  createAggregator: (algExpr: Alg.AggregateExpression, context: IActionContext) => Promise<IBindingAggregator>;
}

/**
 * An RDF evaluator.
 */
export interface IExpressionEvaluator {
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

  /**
   * Orders two RDF terms according to: https://www.w3.org/TR/sparql11-query/#modOrderBy
   * @param termA the first term
   * @param termB the second term
   * @param strict whether to throw an error (true), or compare by value (false) if no other compare rules match.
   */
  orderTypes: (termA: RDF.Term | undefined, termB: RDF.Term | undefined, strict: boolean | undefined) => -1 | 0 | 1;

  /**
   * The factory that created this Expression Evaluator.
   */
  factory: IExpressionEvaluatorFactory;
}
