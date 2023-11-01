import type { ExpressionEvaluator } from '@comunica/expression-evaluator';
import { AggregateEvaluator, typedLiteral, TypeURL } from '@comunica/expression-evaluator';
import * as E from '@comunica/expression-evaluator/lib/expressions';
import type { IBindingsAggregator, IExpressionEvaluator, ITermFunction } from '@comunica/types';
import type * as RDF from '@rdfjs/types';

interface IAverageState {
  sum: E.NumericLiteral;
  count: number;
}

export class AverageAggregator extends AggregateEvaluator implements IBindingsAggregator {
  private state: IAverageState | undefined = undefined;

  public constructor(
    evaluator: IExpressionEvaluator,
    distinct: boolean,
    private readonly additionFunction: ITermFunction,
    private readonly divisionFunction: ITermFunction,
    throwError?: boolean,
  ) {
    super(evaluator, distinct, throwError);
  }

  public emptyValueTerm(): RDF.Term {
    return typedLiteral('0', TypeURL.XSD_INTEGER);
  }

  public putTerm(term: RDF.Term): void {
    if (this.state === undefined) {
      const sum = this.termToNumericOrError(term);
      this.state = { sum, count: 1 };
    } else {
      const internalTerm = this.termToNumericOrError(term);
      this.state.sum = <E.NumericLiteral> this.additionFunction.applyOnTerms([ this.state.sum, internalTerm ],
        (<ExpressionEvaluator> this.evaluator).internalizedExpressionEvaluator);
      this.state.count++;
    }
  }

  public termResult(): RDF.Term | undefined {
    if (this.state === undefined) {
      return this.emptyValue();
    }
    const count = new E.IntegerLiteral(this.state.count);
    const result = this.divisionFunction.applyOnTerms([ this.state.sum, count ],
      (<ExpressionEvaluator> this.evaluator).internalizedExpressionEvaluator);
    return result.toRDF();
  }
}
